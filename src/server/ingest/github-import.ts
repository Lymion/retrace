import { type Db, getDb } from "@/db/client";
import { getEnv } from "../env";
import {
  GithubError,
  downloadZipball,
  fetchRepoInfo,
  parseGithubUrl,
  type RepoRef,
} from "./github";
import { type IngestInput, extractLimits, ingestZip, newTempPath } from "./ingest";

export interface GithubImportOptions {
  afterStore?: (
    repo: RepoRef & { ref: string },
    token: string | undefined,
  ) => IngestInput["afterStore"];
}

/** Checks the repo, downloads its zip archive and runs it through the same safe ingest as uploads. */
export async function importFromGithub(
  url: string,
  options: GithubImportOptions = {},
  db: Db = getDb(),
): Promise<number> {
  const parsed = parseGithubUrl(url);
  if (!parsed) throw new GithubError("Only https://github.com/<owner>/<repo> links are supported.");

  const token = getEnv().GITHUB_TOKEN;
  const info = await fetchRepoInfo(parsed, token);
  const limits = extractLimits(db);

  if (info.size * 1024 > limits.maxBytes) {
    throw new GithubError(
      `This repo is about ${Math.round(info.size / 1024)} MB on GitHub, over the ${Math.round(limits.maxBytes / 1024 / 1024)} MB limit. You can raise the limit in Settings.`,
      413,
    );
  }

  const repo = { ...parsed, ref: parsed.ref ?? info.default_branch };
  const zipPath = newTempPath(".zip");
  try {
    await downloadZipball(repo, token, zipPath, limits.maxBytes);
  } catch (error) {
    // ingestZip deletes the zip on its own path; here we clean up a failed download.
    const { rmSync } = await import("node:fs");
    rmSync(zipPath, { force: true });
    throw error;
  }

  return ingestZip(
    {
      zipPath,
      name: info.full_name,
      source: "github",
      sourceRef: `${info.full_name}@${repo.ref}`,
      afterStore: options.afterStore?.(repo, token),
    },
    db,
  );
}
