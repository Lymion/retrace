import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import yauzl, { type Entry, type ZipFile } from "yauzl";
import { classifyPath, type SkipReason } from "./ignore";

// Reads an uploaded zip without trusting anything in it. Every entry name is
// checked before use, sizes are capped before and during decompression, and
// only .git internals are written to disk (inside a folder we created).
// Project files are kept in memory and never written out or executed.

export type ExtractErrorCode =
  | "invalid_zip"
  | "empty"
  | "path_traversal"
  | "absolute_path"
  | "symlink"
  | "too_many_files"
  | "too_large"
  | "size_mismatch";

export class ExtractError extends Error {
  constructor(
    readonly code: ExtractErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ExtractError";
  }
}

export interface ExtractLimits {
  /** Total uncompressed bytes of the files we keep, and the biggest single entry. */
  maxBytes: number;
  /** Number of project files we keep (ignored folders like node_modules don't count). */
  maxFiles: number;
  /** Files bigger than this are skipped as "too large to teach", not rejected. */
  maxFileBytes: number;
}

export interface ExtractedFile {
  path: string;
  data: Buffer;
}

export interface ExtractResult {
  files: ExtractedFile[];
  /** Absolute path of the extracted .git folder, if the zip had one. */
  gitDir: string | null;
  skipped: Partial<Record<SkipReason, number>>;
}

/**
 * Checks one entry name. yauzl already rejects most bad names; this repeats
 * the checks so safety does not depend on a library default.
 */
export function checkEntryName(name: string): void {
  const normalized = name.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) {
    throw new ExtractError(
      "absolute_path",
      `The zip has a file with an absolute path ("${truncate(name)}"). Upload a normal project zip.`,
    );
  }
  if (normalized.split("/").includes("..")) {
    throw new ExtractError(
      "path_traversal",
      `The zip tries to write outside its folder ("${truncate(name)}"). This is a known attack (zip-slip), so the upload was rejected.`,
    );
  }
}

/** Joins a relative entry path onto `root` and proves the result stays inside it. */
export function safeJoin(root: string, relative: string): string {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, relative);
  if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) {
    throw new ExtractError("path_traversal", "The zip tries to write outside its folder.");
  }
  return target;
}

const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;

function isSymlink(entry: Entry): boolean {
  const mode = (entry.externalFileAttributes >>> 16) & S_IFMT;
  return mode === S_IFLNK;
}

function truncate(value: string): string {
  return value.length > 80 ? `${value.slice(0, 77)}...` : value;
}

function openZip(zipPath: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(
      zipPath,
      // strictFileNames: false turns Windows backslashes into "/" before validation.
      { lazyEntries: true, autoClose: false, validateEntrySizes: true, strictFileNames: false },
      (error, zipfile) => {
        if (error || !zipfile) reject(mapYauzlError(error));
        else resolve(zipfile);
      },
    );
  });
}

function mapYauzlError(error: Error | null | undefined): ExtractError {
  const message = error?.message ?? "";
  if (message.startsWith("absolute path")) {
    return new ExtractError(
      "absolute_path",
      "The zip has a file with an absolute path. Upload a normal project zip.",
    );
  }
  if (message.startsWith("invalid relative path")) {
    return new ExtractError(
      "path_traversal",
      "The zip tries to write outside its folder. This is a known attack (zip-slip), so the upload was rejected.",
    );
  }
  if (/too many|exceeded|size/i.test(message)) {
    return new ExtractError(
      "size_mismatch",
      "A file in the zip is bigger than the zip says. The upload was rejected.",
    );
  }
  return new ExtractError("invalid_zip", "That file is not a readable zip archive.");
}

function readAllEntries(zipfile: ZipFile): Promise<Entry[]> {
  return new Promise((resolve, reject) => {
    const entries: Entry[] = [];
    zipfile.on("entry", (entry: Entry) => {
      entries.push(entry);
      zipfile.readEntry();
    });
    zipfile.on("end", () => resolve(entries));
    zipfile.on("error", (error: Error) => reject(mapYauzlError(error)));
    zipfile.readEntry();
  });
}

function openEntryStream(zipfile: ZipFile, entry: Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (error, stream) => {
      if (error || !stream) reject(mapYauzlError(error));
      else resolve(stream);
    });
  });
}

async function readEntry(zipfile: ZipFile, entry: Entry): Promise<Buffer> {
  const stream = await openEntryStream(zipfile, entry);
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of stream) chunks.push(chunk as Buffer);
  } catch (error) {
    throw mapYauzlError(error as Error);
  }
  return Buffer.concat(chunks);
}

/**
 * If every entry sits under one top-level folder (GitHub zipballs always do,
 * and so do most hand-made zips), return that folder so we can strip it.
 */
function commonRoot(names: string[]): string | null {
  let root: string | null = null;
  for (const name of names) {
    const slash = name.indexOf("/");
    if (slash === -1) return null; // a file at the top level
    const first = name.slice(0, slash + 1);
    if (root === null) root = first;
    else if (root !== first) return null;
  }
  return root;
}

export async function extractZip(
  zipPath: string,
  destDir: string,
  limits: ExtractLimits,
): Promise<ExtractResult> {
  const zipfile = await openZip(zipPath);
  try {
    const entries = await readAllEntries(zipfile);

    // Pass 1: validate every entry before reading any content.
    for (const entry of entries) {
      checkEntryName(entry.fileName);
      if (isSymlink(entry)) {
        throw new ExtractError(
          "symlink",
          `The zip contains a symbolic link ("${truncate(entry.fileName)}"). Links can point outside the project, so the upload was rejected.`,
        );
      }
      if (entry.uncompressedSize > limits.maxBytes) {
        throw new ExtractError(
          "too_large",
          `"${truncate(entry.fileName)}" is larger than the ${mb(limits.maxBytes)} limit.`,
        );
      }
    }

    const fileEntries = entries.filter((entry) => !entry.fileName.endsWith("/"));
    if (fileEntries.length === 0) throw new ExtractError("empty", "The zip is empty.");

    const root = commonRoot(fileEntries.map((entry) => entry.fileName));
    const skipped: Partial<Record<SkipReason, number>> = {};
    const keep: { entry: Entry; path: string }[] = [];
    const gitEntries: { entry: Entry; path: string }[] = [];
    let keptBytes = 0;

    for (const entry of fileEntries) {
      const relative = root ? entry.fileName.slice(root.length) : entry.fileName;
      if (!relative) continue;

      if (relative === ".git" || relative.startsWith(".git/")) {
        gitEntries.push({ entry, path: relative });
        continue;
      }

      const reason =
        classifyPath(relative) ??
        (entry.uncompressedSize > limits.maxFileBytes ? "too large" : null);
      if (reason) {
        skipped[reason] = (skipped[reason] ?? 0) + 1;
        continue;
      }

      keptBytes += entry.uncompressedSize;
      keep.push({ entry, path: relative });
    }

    if (keep.length > limits.maxFiles) {
      throw new ExtractError(
        "too_many_files",
        `The project has ${keep.length} files; the limit is ${limits.maxFiles}. You can raise it in Settings.`,
      );
    }
    if (keptBytes > limits.maxBytes) {
      throw new ExtractError(
        "too_large",
        `The project's files add up to ${mb(keptBytes)}; the limit is ${mb(limits.maxBytes)}.`,
      );
    }
    if (keep.length === 0) {
      throw new ExtractError(
        "empty",
        "The zip has no source files we can read (only ignored folders or binaries).",
      );
    }

    // Pass 2: read the kept files into memory.
    const files: ExtractedFile[] = [];
    for (const { entry, path: relative } of keep) {
      files.push({ path: relative, data: await readEntry(zipfile, entry) });
    }

    // .git internals go to disk because isomorphic-git reads from a folder.
    // They are only ever read as data: no hooks, no checkout.
    let gitDir: string | null = null;
    let gitBytes = 0;
    if (gitEntries.length > 0) {
      for (const { entry, path: relative } of gitEntries) {
        gitBytes += entry.uncompressedSize;
        if (gitBytes > limits.maxBytes) {
          throw new ExtractError(
            "too_large",
            `The .git folder is larger than the ${mb(limits.maxBytes)} limit.`,
          );
        }
        const target = safeJoin(destDir, relative);
        mkdirSync(path.dirname(target), { recursive: true });
        const stream = await openEntryStream(zipfile, entry);
        try {
          await pipeline(stream, createWriteStream(target, { flags: "wx" }));
        } catch (error) {
          throw error instanceof ExtractError ? error : mapYauzlError(error as Error);
        }
      }
      gitDir = safeJoin(destDir, ".git");
    }

    return { files, gitDir, skipped };
  } finally {
    zipfile.close();
  }
}

function mb(bytes: number): string {
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
}
