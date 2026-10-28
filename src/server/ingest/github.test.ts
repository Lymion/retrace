import { afterEach, describe, expect, it, vi } from "vitest";
import { tempDir } from "@tests/helpers/zips";
import {
  GithubError,
  GithubImportSchema,
  downloadZipball,
  fetchRepoInfo,
  parseGithubUrl,
} from "./github";

afterEach(() => vi.unstubAllGlobals());

describe("parseGithubUrl", () => {
  it.each([
    ["https://github.com/vercel/next.js", { owner: "vercel", repo: "next.js", ref: null }],
    ["https://github.com/a/b/", { owner: "a", repo: "b", ref: null }],
    ["https://github.com/a/b.git", { owner: "a", repo: "b", ref: null }],
    ["https://github.com/a/b/tree/main", { owner: "a", repo: "b", ref: "main" }],
    [
      "https://github.com/a/b/tree/feature/login-v2",
      { owner: "a", repo: "b", ref: "feature/login-v2" },
    ],
    ["  https://github.com/a/b  ", { owner: "a", repo: "b", ref: null }],
  ])("accepts %s", (url, expected) => {
    expect(parseGithubUrl(url)).toEqual(expected);
  });

  it.each([
    "http://github.com/a/b",
    "https://gitlab.com/a/b",
    "https://github.com.evil.com/a/b",
    "https://evil.com/github.com/a/b",
    "https://github.com/a",
    "https://github.com/a/b/blob/main/x.js",
    "https://github.com/a/b?x=1",
    "https://github.com/a/b#readme",
    "https://github.com/a/b/tree/../../etc",
    "https://user:pass@github.com/a/b",
    "file:///etc/passwd",
    "https://github.com/../b",
  ])("rejects %s", (url) => {
    expect(parseGithubUrl(url)).toBeNull();
  });

  it("explains the rule in the schema error", () => {
    const result = GithubImportSchema.safeParse({ url: "https://example.com/x" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/github\.com\/owner\/repo/);
  });
});

describe("GitHub calls", () => {
  it("says what to do for a private repo without a token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 404 })),
    );
    const error = await fetchRepoInfo({ owner: "a", repo: "b", ref: null }, undefined).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(GithubError);
    expect((error as Error).message).toMatch(/GITHUB_TOKEN/);
  });

  it("sends the token to api.github.com only", async () => {
    const fetchMock = vi.fn(async (url: URL, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      if (url.hostname === "api.github.com") {
        expect(headers.Authorization).toBe("Bearer test-token");
        return new Response(null, {
          status: 302,
          headers: { location: "https://codeload.github.com/a/b/zip/main" },
        });
      }
      expect(headers.Authorization).toBeUndefined();
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await downloadZipball(
      { owner: "a", repo: "b", ref: "main" },
      "test-token",
      `${tempDir()}/repo.zip`,
      1000,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refuses to follow a redirect away from GitHub", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(null, { status: 302, headers: { location: "https://evil.example/steal" } }),
      ),
    );
    const error = await downloadZipball(
      { owner: "a", repo: "b", ref: "main" },
      "t",
      `${tempDir()}/r.zip`,
      1000,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GithubError);
    expect((error as Error).message).toMatch(/outside GitHub/);
  });

  it("stops a download that passes the size limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array(5000), { status: 200 })),
    );
    await expect(
      downloadZipball(
        { owner: "a", repo: "b", ref: "main" },
        undefined,
        `${tempDir()}/big.zip`,
        1000,
      ),
    ).rejects.toThrow(/limit/);
  });
});
