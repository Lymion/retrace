import { createWriteStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { z } from "zod";

// GitHub import. We never fetch the URL the learner typed: we parse it into
// owner/repo/ref, then build GitHub API URLs ourselves. The optional token
// is only ever sent to GitHub's own hosts.

export interface RepoRef {
  owner: string;
  repo: string;
  /** Branch, tag or commit. Null means the repo's default branch. */
  ref: string | null;
}

const OWNER = "[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})";
const REPO = "[A-Za-z0-9._-]{1,100}";
const REF = "[A-Za-z0-9._/-]{1,200}";
const GITHUB_URL = new RegExp(
  `^https://github\\.com/(${OWNER})/(${REPO}?)(?:\\.git)?(?:/tree/(${REF}))?/?$`,
);

export function parseGithubUrl(input: string): RepoRef | null {
  const match = GITHUB_URL.exec(input.trim());
  if (!match) return null;
  const [, owner, repo, ref] = match;
  if (!owner || !repo || repo === "." || repo === "..") return null;
  if (
    ref &&
    (ref.includes("..") || ref.startsWith("/") || ref.endsWith("/") || ref.includes("//"))
  ) {
    return null;
  }
  return { owner, repo, ref: ref ?? null };
}

export const GithubImportSchema = z.object({
  url: z
    .string()
    .max(400)
    .refine((value) => parseGithubUrl(value) !== null, {
      message:
        "Paste a link like https://github.com/owner/repo (optionally /tree/branch). Other sites are not supported.",
    }),
});

export class GithubError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "GithubError";
  }
}

const ALLOWED_HOSTS = new Set(["api.github.com", "codeload.github.com", "github.com"]);
const TOKEN_HOSTS = new Set(["api.github.com", "github.com"]);

/** fetch() that refuses any host but GitHub's, and adds the token only where it belongs. */
async function githubFetch(url: URL, token: string | undefined, accept: string): Promise<Response> {
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) {
    throw new GithubError("Refused to contact a host outside GitHub.");
  }
  const headers: Record<string, string> = {
    Accept: accept,
    "User-Agent": "retrace-local",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token && TOKEN_HOSTS.has(url.hostname)) headers.Authorization = `Bearer ${token}`;
  return fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(60_000) });
}

const RepoInfoSchema = z.object({
  full_name: z.string(),
  private: z.boolean(),
  default_branch: z.string(),
  /** In kilobytes, as GitHub reports it. */
  size: z.number(),
});
export type RepoInfo = z.infer<typeof RepoInfoSchema>;

export async function fetchRepoInfo(ref: RepoRef, token: string | undefined): Promise<RepoInfo> {
  const url = new URL(
    `https://api.github.com/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`,
  );
  const response = await githubFetch(url, token, "application/vnd.github+json");
  if (response.status === 404) {
    throw new GithubError(
      token
        ? "Repo not found. Check the link, and that your GITHUB_TOKEN can read this repo."
        : "Repo not found. If it is private, add a read-only GITHUB_TOKEN to your .env file and restart.",
      404,
    );
  }
  if (response.status === 401)
    throw new GithubError("GitHub rejected the GITHUB_TOKEN in .env.", 401);
  if (response.status === 403 || response.status === 429) {
    throw new GithubError(
      "GitHub's rate limit was hit. Wait a few minutes, or add a GITHUB_TOKEN.",
      429,
    );
  }
  if (!response.ok) throw new GithubError(`GitHub returned an error (${response.status}).`, 502);
  const parsed = RepoInfoSchema.safeParse(await response.json());
  if (!parsed.success) throw new GithubError("GitHub sent an unexpected reply.", 502);
  return parsed.data;
}

function encodeRef(ref: string): string {
  return ref.split("/").map(encodeURIComponent).join("/");
}

/** Downloads the repo's zip archive to `targetPath`, stopping if it passes `maxBytes`. */
export async function downloadZipball(
  ref: RepoRef & { ref: string },
  token: string | undefined,
  targetPath: string,
  maxBytes: number,
): Promise<void> {
  let url = new URL(
    `https://api.github.com/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/zipball/${encodeRef(ref.ref)}`,
  );
  let response = await githubFetch(url, token, "application/vnd.github+json");

  // The API answers with a redirect to codeload.github.com. Follow at most a
  // couple of hops, and only to GitHub hosts (githubFetch enforces that).
  for (let hops = 0; response.status >= 300 && response.status < 400 && hops < 3; hops++) {
    const location = response.headers.get("location");
    if (!location) break;
    url = new URL(location, url);
    response = await githubFetch(url, token, "application/zip");
  }

  if (response.status === 404)
    throw new GithubError(`Branch or tag "${ref.ref}" was not found.`, 404);
  if (!response.ok || !response.body) {
    throw new GithubError(`Could not download the repo (GitHub status ${response.status}).`, 502);
  }

  await streamToFile(response.body, targetPath, maxBytes);
}

/** Writes a web stream to disk and aborts as soon as it passes `maxBytes`. */
export async function streamToFile(
  body: ReadableStream<Uint8Array>,
  targetPath: string,
  maxBytes: number,
): Promise<number> {
  let received = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > maxBytes) {
        callback(new SizeLimitError(maxBytes));
        return;
      }
      callback(null, chunk);
    },
  });
  // Readable.fromWeb's parameter type comes from node:stream/web, which differs
  // from the DOM ReadableStream type only in name.
  const source = Readable.fromWeb(body as unknown as Parameters<typeof Readable.fromWeb>[0]);
  await pipeline(source, limiter, createWriteStream(targetPath, { flags: "wx" }));
  return received;
}

export class SizeLimitError extends Error {
  constructor(readonly maxBytes: number) {
    super(`The download is larger than the ${Math.round(maxBytes / 1024 / 1024)} MB limit.`);
    this.name = "SizeLimitError";
  }
}
