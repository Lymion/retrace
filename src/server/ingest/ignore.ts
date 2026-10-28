// Decides which paths in an upload are not worth teaching from. Skipped
// files are never stored; the learner sees a count per reason.

export type SkipReason =
  | "dependency folder"
  | "build output"
  | "editor or OS file"
  | "lockfile"
  | "binary or media"
  | "key or certificate"
  | "too large";

const DEPENDENCY_DIRS = new Set([
  "node_modules",
  "bower_components",
  "jspm_packages",
  "vendor",
  ".venv",
  "venv",
  "site-packages",
  ".bundle",
]);

const BUILD_DIRS = new Set([
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".vercel",
  ".parcel-cache",
  ".cache",
  "dist",
  "build",
  "out",
  "coverage",
  "target",
  "obj",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".gradle",
  ".dart_tool",
  ".expo",
]);

const EDITOR_DIRS = new Set([".idea", ".vscode", ".vs", ".svn", ".hg", ".history"]);
const EDITOR_FILES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

const LOCKFILES = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "bun.lock",
  "poetry.lock",
  "Pipfile.lock",
  "uv.lock",
  "Cargo.lock",
  "composer.lock",
  "Gemfile.lock",
  "go.sum",
]);

const BINARY_EXTENSIONS = new Set([
  // images
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "ico",
  "tif",
  "tiff",
  "svg",
  "avif",
  "heic",
  "psd",
  "ai",
  "sketch",
  "fig",
  // audio and video
  "mp3",
  "wav",
  "ogg",
  "flac",
  "m4a",
  "mp4",
  "mov",
  "avi",
  "mkv",
  "webm",
  // documents and archives
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "zip",
  "tar",
  "gz",
  "tgz",
  "bz2",
  "xz",
  "7z",
  "rar",
  "jar",
  "war",
  // compiled code and native libraries
  "exe",
  "dll",
  "so",
  "dylib",
  "o",
  "a",
  "lib",
  "class",
  "pyc",
  "pyo",
  "wasm",
  "bin",
  "dat",
  // fonts
  "woff",
  "woff2",
  "ttf",
  "otf",
  "eot",
  // databases
  "db",
  "sqlite",
  "sqlite3",
  // source maps and minified bundles are build output in disguise
  "map",
]);

const KEY_EXTENSIONS = new Set([
  "pem",
  "key",
  "p12",
  "pfx",
  "keystore",
  "jks",
  "crt",
  "cer",
  "der",
]);
const KEY_FILES = new Set(["id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"]);

/** Returns why a path should be skipped, or null to keep it. */
export function classifyPath(filePath: string): SkipReason | null {
  const parts = filePath.split("/");
  const name = parts[parts.length - 1] ?? "";
  const dirs = parts.slice(0, -1);

  if (dirs.some((dir) => DEPENDENCY_DIRS.has(dir))) return "dependency folder";
  if (dirs.some((dir) => BUILD_DIRS.has(dir))) return "build output";
  if (dirs.some((dir) => EDITOR_DIRS.has(dir)) || EDITOR_FILES.has(name))
    return "editor or OS file";
  if (LOCKFILES.has(name)) return "lockfile";
  if (KEY_FILES.has(name)) return "key or certificate";

  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  if (KEY_EXTENSIONS.has(ext)) return "key or certificate";
  if (BINARY_EXTENSIONS.has(ext)) return "binary or media";
  if (/\.min\.(js|css)$/i.test(name)) return "build output";

  return null;
}

/** A NUL byte in the first 8 KB is the classic sign of a binary file. */
export function looksBinary(data: Buffer): boolean {
  const sample = data.subarray(0, 8192);
  return sample.includes(0);
}
