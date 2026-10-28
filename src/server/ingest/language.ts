// Maps a file path to a Monaco language id, so the same value drives both
// the stats on the project page and syntax highlighting in the viewer.

const BY_EXTENSION: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "typescript",
  py: "python",
  rb: "ruby",
  php: "php",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  swift: "swift",
  cs: "csharp",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  ino: "cpp",
  dart: "dart",
  lua: "lua",
  r: "r",
  scala: "scala",
  html: "html",
  htm: "html",
  vue: "html",
  svelte: "html",
  css: "css",
  scss: "scss",
  sass: "scss",
  less: "less",
  json: "json",
  jsonc: "json",
  md: "markdown",
  mdx: "markdown",
  sql: "sql",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  ps1: "powershell",
  bat: "bat",
  cmd: "bat",
  yml: "yaml",
  yaml: "yaml",
  toml: "ini",
  ini: "ini",
  cfg: "ini",
  conf: "ini",
  xml: "xml",
  graphql: "graphql",
  gql: "graphql",
  prisma: "plaintext",
  txt: "plaintext",
};

const BY_NAME: Record<string, string> = {
  Dockerfile: "dockerfile",
  Makefile: "plaintext",
  Procfile: "plaintext",
  ".gitignore": "plaintext",
  ".dockerignore": "plaintext",
  ".editorconfig": "ini",
  ".npmrc": "ini",
};

export function detectLanguage(filePath: string): string {
  const name = filePath.split("/").pop() ?? filePath;
  if (BY_NAME[name]) return BY_NAME[name];
  if (/^\.env(\..*)?$/.test(name)) return "ini";
  if (/^Dockerfile\./.test(name)) return "dockerfile";
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "plaintext";
  return BY_EXTENSION[name.slice(dot + 1).toLowerCase()] ?? "plaintext";
}

const LABELS: Record<string, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  python: "Python",
  csharp: "C#",
  cpp: "C++",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  json: "JSON",
  sql: "SQL",
  yaml: "YAML",
  xml: "XML",
  ini: "Config",
  plaintext: "Plain text",
  markdown: "Markdown",
  shell: "Shell",
  php: "PHP",
};

/** Human-friendly name for stats ("JavaScript", not "javascript"). */
export function languageLabel(language: string): string {
  return LABELS[language] ?? language.charAt(0).toUpperCase() + language.slice(1);
}
