import fs from "node:fs";
import git, { type ReadCommitResult, TREE, type WalkerEntry } from "isomorphic-git";
import http from "isomorphic-git/http/node";
import type { RepoRef } from "../ingest/github";

// Reads commit order, dates and changed paths, nothing else: no messages,
// no authors, no file contents. isomorphic-git is pure JavaScript, so no
// git binary runs and no hooks from the upload can ever execute.

export interface HistoryCommit {
  /** 0 is the oldest commit we have. */
  idx: number;
  date: Date;
  changedPaths: string[];
}

export interface GitHistory {
  commits: HistoryCommit[];
  /** True when older commits exist that we did not read. */
  truncated: boolean;
}

export const MAX_COMMITS = 300;
const MAX_PATHS_PER_COMMIT = 500;

async function blobPaths(gitdir: string, oid: string): Promise<string[]> {
  const paths: string[] = [];
  await git.walk({
    fs,
    gitdir,
    trees: [TREE({ ref: oid })],
    map: async (filepath: string, [entry]: (WalkerEntry | null)[]) => {
      if (filepath === ".") return true;
      if ((await entry?.type()) === "blob") paths.push(filepath);
      return true;
    },
  });
  // walk() reads folders in parallel, so sort to make the order the same every run.
  return paths.sort();
}

/** Paths that differ between a commit and its parent, skipping unchanged folders. */
async function changedPaths(gitdir: string, oid: string, parentOid: string): Promise<string[]> {
  const paths: string[] = [];
  await git.walk({
    fs,
    gitdir,
    trees: [TREE({ ref: oid }), TREE({ ref: parentOid })],
    map: async (filepath: string, [now, before]: (WalkerEntry | null)[]) => {
      if (filepath === ".") return true;
      const [nowOid, beforeOid] = await Promise.all([now?.oid(), before?.oid()]);
      if (nowOid === beforeOid) return null; // identical: skip this whole subtree
      if (now && (await now.type()) === "blob") paths.push(filepath);
      return true;
    },
  });
  // walk() reads folders in parallel, so sort to make the order the same every run.
  return paths.sort();
}

export async function readGitHistory(
  gitdir: string,
  maxCommits = MAX_COMMITS,
): Promise<GitHistory> {
  let log: ReadCommitResult[];
  try {
    log = await git.log({ fs, gitdir, depth: maxCommits });
  } catch {
    return { commits: [], truncated: false };
  }
  let truncated = log.length >= maxCommits;
  const oldestFirst = [...log].reverse();
  const commits: HistoryCommit[] = [];

  for (const [idx, entry] of oldestFirst.entries()) {
    const parent = entry.commit.parent[0];
    let paths: string[];
    if (!parent) {
      paths = await blobPaths(gitdir, entry.oid);
    } else {
      try {
        paths = await changedPaths(gitdir, entry.oid, parent);
      } catch {
        // The parent is missing in a shallow clone: everything here already existed.
        paths = await blobPaths(gitdir, entry.oid);
        truncated = true;
      }
    }
    commits.push({
      idx,
      date: new Date(entry.commit.committer.timestamp * 1000),
      changedPaths: paths.slice(0, MAX_PATHS_PER_COMMIT),
    });
  }
  return { commits, truncated };
}

/** For each path, the index of the first commit that touched it. */
export function firstSeen(history: GitHistory, keep: Set<string>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const commit of history.commits) {
    for (const filePath of commit.changedPaths) {
      if (keep.has(filePath) && !(filePath in result)) result[filePath] = commit.idx;
    }
  }
  return result;
}

/**
 * Shallow, history-only clone of a GitHub repo into `dir` (no checkout, so
 * no project files are written). The URL is built from parsed parts, never
 * taken from the learner's input.
 */
export async function cloneGithubHistory(
  repo: RepoRef & { ref: string },
  token: string | undefined,
  dir: string,
  timeoutMs = 90_000,
): Promise<GitHistory> {
  const url = `https://github.com/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}.git`;
  const clone = git.clone({
    fs,
    http,
    dir,
    url,
    ref: repo.ref,
    depth: MAX_COMMITS,
    singleBranch: true,
    noCheckout: true,
    noTags: true,
    onAuth: () => (token ? { username: "x-access-token", password: token } : { cancel: true }),
  });
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("history clone timed out")), timeoutMs);
  });
  try {
    await Promise.race([clone, timeout]);
  } finally {
    clearTimeout(timer);
  }
  return readGitHistory(`${dir}/.git`);
}
