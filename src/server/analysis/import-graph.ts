import { builtinModules } from "node:module";
import path from "node:path";
import ts from "typescript";

// Builds "file A uses file B" edges from source text alone. Nothing is
// executed or imported: JS/TS goes through the TypeScript scanner, and other
// languages use small pattern scanners. Anything we cannot resolve to a file
// in the upload is recorded as an external package.

export interface GraphFile {
  path: string;
  language: string;
  content: string;
}

export interface ImportEdge {
  from: string;
  to: string;
  specifier: string;
}

export interface ImportGraph {
  edges: ImportEdge[];
  /** Bare package names used, e.g. "express", "@tanstack/react-query", "flask". */
  external: { from: string; name: string }[];
}

const posix = path.posix;
const JS_LANGS = new Set(["javascript", "typescript"]);
const JS_EXTS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".vue",
  ".svelte",
  ".json",
];
const STYLE_EXTS = [".css", ".scss", ".sass", ".less"];
const NODE_BUILTINS = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));
const PYTHON_STDLIB = new Set([
  "os",
  "sys",
  "re",
  "json",
  "math",
  "time",
  "datetime",
  "random",
  "typing",
  "pathlib",
  "sqlite3",
  "logging",
  "functools",
  "itertools",
  "collections",
  "dataclasses",
  "subprocess",
  "unittest",
  "hashlib",
  "hmac",
  "secrets",
  "uuid",
  "base64",
  "io",
  "csv",
  "abc",
  "enum",
  "asyncio",
  "threading",
  "argparse",
  "shutil",
  "tempfile",
  "glob",
  "string",
  "copy",
  "contextlib",
  "urllib",
  "http",
  "socket",
  "email",
  "decimal",
  "statistics",
  "traceback",
  "inspect",
  "importlib",
  "pickle",
  "struct",
  "zlib",
]);

/** Path aliases from tsconfig/jsconfig "paths" (e.g. "@/*" -> "src/*"). */
interface Alias {
  prefix: string;
  targets: string[];
}

function readAliases(byPath: Map<string, GraphFile>): Alias[] {
  const aliases: Alias[] = [];
  for (const name of ["tsconfig.json", "jsconfig.json"]) {
    const file = byPath.get(name);
    if (!file) continue;
    // TypeScript's own parser understands comments and trailing commas in tsconfig.
    const parsed = ts.parseConfigFileTextToJson(name, file.content);
    const options = (
      parsed.config as
        { compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } } | undefined
    )?.compilerOptions;
    const baseUrl = options?.baseUrl ?? ".";
    for (const [pattern, targets] of Object.entries(options?.paths ?? {})) {
      if (!Array.isArray(targets)) continue;
      aliases.push({
        prefix: pattern.replace(/\*$/, ""),
        targets: targets.map((t) =>
          posix.normalize(posix.join(baseUrl, String(t).replace(/\*$/, ""))),
        ),
      });
    }
  }
  // The two conventions most projects use, even without a tsconfig.
  if (!aliases.some((a) => a.prefix === "@/"))
    aliases.push({ prefix: "@/", targets: ["src/", ""] });
  if (!aliases.some((a) => a.prefix === "~/"))
    aliases.push({ prefix: "~/", targets: ["src/", "app/", ""] });
  return aliases;
}

class Resolver {
  constructor(private readonly paths: Set<string>) {}

  /** Tries the path as given, with known extensions, and as a folder index. */
  probe(base: string, extensions: string[]): string | null {
    const clean = posix.normalize(base).replace(/^\.\//, "").replace(/\/$/, "");
    if (clean.startsWith("..")) return null;
    if (this.paths.has(clean)) return clean;
    // ESM-style TypeScript imports write "./x.js" for a file named x.ts.
    const swapped = clean.replace(/\.(m|c)?js$/, "");
    for (const ext of extensions) {
      if (this.paths.has(clean + ext)) return clean + ext;
      if (swapped !== clean && this.paths.has(swapped + ext)) return swapped + ext;
    }
    for (const ext of extensions) {
      if (this.paths.has(`${clean}/index${ext}`)) return `${clean}/index${ext}`;
    }
    return null;
  }

  /** Finds a file by name alone when it is the only one with that name. */
  byUniqueBasename(name: string): string | null {
    let found: string | null = null;
    for (const candidate of this.paths) {
      if (posix.basename(candidate) === name) {
        if (found) return null;
        found = candidate;
      }
    }
    return found;
  }
}

function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? specifier);
}

function scanJs(file: GraphFile, resolver: Resolver, aliases: Alias[], graph: ImportGraph) {
  const dir = posix.dirname(file.path);
  const info = ts.preProcessFile(file.content, true, true);
  for (const ref of info.importedFiles) {
    const spec = ref.fileName;
    let target: string | null = null;
    if (spec.startsWith(".")) {
      target = resolver.probe(posix.join(dir, spec), [...JS_EXTS, ...STYLE_EXTS]);
    } else if (spec.startsWith("/")) {
      target =
        resolver.probe(posix.join(dir, spec), JS_EXTS) ?? resolver.probe(spec.slice(1), JS_EXTS);
    } else {
      const alias = aliases.find((a) => spec.startsWith(a.prefix));
      if (alias) {
        for (const root of alias.targets) {
          target = resolver.probe(posix.join(root, spec.slice(alias.prefix.length)), [
            ...JS_EXTS,
            ...STYLE_EXTS,
          ]);
          if (target) break;
        }
      }
      if (!target && !alias) {
        if (!NODE_BUILTINS.has(spec) && !spec.startsWith("node:")) {
          graph.external.push({ from: file.path, name: packageName(spec) });
        }
        continue;
      }
    }
    if (target && target !== file.path)
      graph.edges.push({ from: file.path, to: target, specifier: spec });
  }
}

function pythonModuleCandidates(modulePath: string): string[] {
  const asPath = modulePath.replace(/\./g, "/");
  return [`${asPath}.py`, `${asPath}/__init__.py`];
}

function scanPython(file: GraphFile, resolver: Resolver, graph: ImportGraph) {
  const dir = posix.dirname(file.path);
  const roots = ["", "src/", dir === "." ? "" : `${dir}/`];
  const add = (target: string | null, spec: string) => {
    if (target && target !== file.path)
      graph.edges.push({ from: file.path, to: target, specifier: spec });
  };
  const resolveAbsolute = (modulePath: string): string | null => {
    for (const root of roots) {
      for (const candidate of pythonModuleCandidates(modulePath)) {
        const hit = resolver.probe(root + candidate, []);
        if (hit) return hit;
      }
    }
    return null;
  };

  for (const line of file.content.split("\n")) {
    const from = /^\s*from\s+(\.*)([\w.]*)\s+import\s+\(?\s*([\w\s,*]+)/.exec(line);
    if (from) {
      const [, dots = "", modulePath = "", names = ""] = from;
      const spec = `${dots}${modulePath}`;
      if (dots) {
        // Relative import: one dot is this package, each extra dot goes up one.
        let base = dir === "." ? "" : dir;
        for (let i = 1; i < dots.length; i++)
          base = posix.dirname(base) === "." ? "" : posix.dirname(base);
        const prefix = base ? `${base}/` : "";
        if (modulePath) {
          add(
            pythonModuleCandidates(modulePath)
              .map((c) => resolver.probe(prefix + c, []))
              .find(Boolean) ?? null,
            spec,
          );
        } else {
          for (const name of names
            .split(",")
            .map((n) => n.trim().split(/\s+/)[0])
            .filter(Boolean)) {
            add(
              pythonModuleCandidates(name ?? "")
                .map((c) => resolver.probe(prefix + c, []))
                .find(Boolean) ?? null,
              spec,
            );
          }
        }
        continue;
      }
      // "from a.b import c" may mean module a/b/c.py or name c inside a/b.py.
      const firstName = names.split(",")[0]?.trim().split(/\s+/)[0];
      const target =
        (firstName && resolveAbsolute(`${modulePath}.${firstName}`)) || resolveAbsolute(modulePath);
      if (target) add(target, spec);
      else if (!PYTHON_STDLIB.has(modulePath.split(".")[0] ?? "")) {
        graph.external.push({ from: file.path, name: modulePath.split(".")[0] ?? modulePath });
      }
      continue;
    }
    const plain = /^\s*import\s+([\w.,\s]+?)(?:\s+as\s+\w+)?\s*$/.exec(line);
    if (plain?.[1]) {
      for (const part of plain[1].split(",")) {
        const modulePath = part.trim().split(/\s+/)[0] ?? "";
        if (!modulePath) continue;
        const target = resolveAbsolute(modulePath);
        if (target) add(target, modulePath);
        else if (!PYTHON_STDLIB.has(modulePath.split(".")[0] ?? "")) {
          graph.external.push({ from: file.path, name: modulePath.split(".")[0] ?? modulePath });
        }
      }
    }
  }

  // Flask's render_template("x.html") points into a templates/ folder.
  for (const match of file.content.matchAll(/render_template\(\s*["']([^"']+)["']/g)) {
    const name = match[1] ?? "";
    add(
      resolver.probe(`templates/${name}`, []) ?? resolver.probe(`${dir}/templates/${name}`, []),
      name,
    );
  }
}

function scanRegex(
  file: GraphFile,
  resolver: Resolver,
  graph: ImportGraph,
  pattern: RegExp,
  extensions: string[],
) {
  const dir = posix.dirname(file.path);
  for (const match of file.content.matchAll(pattern)) {
    const spec = match[1];
    if (!spec) continue;
    const target = resolver.probe(posix.join(dir, spec), extensions);
    if (target && target !== file.path)
      graph.edges.push({ from: file.path, to: target, specifier: spec });
  }
}

function scanHtml(file: GraphFile, resolver: Resolver, graph: ImportGraph) {
  const dir = posix.dirname(file.path);
  const refs = [
    ...file.content.matchAll(/<script[^>]+src=["']([^"':]+)["']/gi),
    ...file.content.matchAll(/<link[^>]+href=["']([^"':]+\.css)["']/gi),
  ];
  for (const match of refs) {
    const spec = match[1] ?? "";
    // In Vite and similar tools "/src/main.jsx" is relative to the folder holding index.html.
    const target = spec.startsWith("/")
      ? (resolver.probe(posix.join(dir, spec), JS_EXTS) ?? resolver.probe(spec.slice(1), JS_EXTS))
      : resolver.probe(posix.join(dir, spec), JS_EXTS);
    if (target) graph.edges.push({ from: file.path, to: target, specifier: spec });
  }
  // Jinja/Django template inheritance: {% extends "base.html" %}
  const templatesRoot = file.path.includes("templates/")
    ? file.path.slice(0, file.path.indexOf("templates/") + "templates/".length)
    : `${dir}/`;
  for (const match of file.content.matchAll(
    /\{%-?\s*(?:extends|include|import)\s+["']([^"']+)["']/g,
  )) {
    const target = resolver.probe(templatesRoot + (match[1] ?? ""), []);
    if (target && target !== file.path)
      graph.edges.push({ from: file.path, to: target, specifier: match[1] ?? "" });
  }
}

/** Code that loads a file by name, like readFileSync(".../schema.sql"), depends on that file. */
function scanResourceRefs(file: GraphFile, resolver: Resolver, graph: ImportGraph) {
  const dir = posix.dirname(file.path);
  for (const match of file.content.matchAll(
    /["'`]([\w./-]+\.(?:sql|graphql|prisma|ya?ml))["'`]/g,
  )) {
    const spec = match[1] ?? "";
    const target =
      resolver.probe(posix.join(dir, spec), []) ?? resolver.byUniqueBasename(posix.basename(spec));
    if (target && target !== file.path)
      graph.edges.push({ from: file.path, to: target, specifier: spec });
  }
}

function scanGo(
  file: GraphFile,
  files: GraphFile[],
  modulePrefix: string | null,
  graph: ImportGraph,
) {
  const block = /import\s*\(([\s\S]*?)\)/.exec(file.content)?.[1] ?? "";
  const single = [...file.content.matchAll(/^import\s+(?:\w+\s+)?"([^"]+)"/gm)].map(
    (m) => m[1] ?? "",
  );
  const specs = [...[...block.matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? ""), ...single];
  for (const spec of specs) {
    if (modulePrefix && spec.startsWith(`${modulePrefix}/`)) {
      const dir = spec.slice(modulePrefix.length + 1);
      for (const candidate of files) {
        if (
          candidate.language === "go" &&
          posix.dirname(candidate.path) === dir &&
          !candidate.path.endsWith("_test.go")
        ) {
          graph.edges.push({ from: file.path, to: candidate.path, specifier: spec });
        }
      }
    } else if (spec.includes(".")) {
      graph.external.push({ from: file.path, name: spec });
    }
  }
}

export function buildImportGraph(files: GraphFile[]): ImportGraph {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const resolver = new Resolver(new Set(byPath.keys()));
  const aliases = readAliases(byPath);
  const goModule = /^module\s+(\S+)/m.exec(byPath.get("go.mod")?.content ?? "")?.[1] ?? null;
  const graph: ImportGraph = { edges: [], external: [] };

  for (const file of files) {
    const ext = posix.extname(file.path).toLowerCase();
    if (JS_LANGS.has(file.language) || ext === ".vue" || ext === ".svelte") {
      scanJs(file, resolver, aliases, graph);
      scanResourceRefs(file, resolver, graph);
    } else if (file.language === "python") {
      scanPython(file, resolver, graph);
      scanResourceRefs(file, resolver, graph);
    } else if (file.language === "html") {
      scanHtml(file, resolver, graph);
    } else if (STYLE_EXTS.includes(ext)) {
      scanRegex(file, resolver, graph, /@(?:import|use)\s+(?:url\()?["']([^"']+)["']/g, STYLE_EXTS);
    } else if (file.language === "c" || file.language === "cpp") {
      scanRegex(file, resolver, graph, /#include\s+"([^"]+)"/g, []);
    } else if (file.language === "ruby") {
      scanRegex(file, resolver, graph, /require_relative\s+["']([^"']+)["']/g, [".rb"]);
    } else if (file.language === "php") {
      scanRegex(file, resolver, graph, /(?:require|include)(?:_once)?\s*\(?\s*["']([^"']+)["']/g, [
        ".php",
      ]);
    } else if (file.language === "go") {
      scanGo(file, files, goModule, graph);
    }
  }

  // The same edge can be found twice (e.g. an import and a resource string).
  const seen = new Set<string>();
  graph.edges = graph.edges.filter((edge) => {
    const key = `${edge.from}\0${edge.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return graph;
}
