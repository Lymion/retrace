import path from "node:path";
import type { Dependency } from "@/shared/analysis";

// Reads declared dependencies from manifest files as plain text. We never
// install anything: this is only so the tutor knows what the project uses.

interface TextFile {
  path: string;
  content: string;
}

function fromPackageJson(file: TextFile): Dependency[] {
  let pkg: { dependencies?: unknown; devDependencies?: unknown };
  try {
    pkg = JSON.parse(file.content) as typeof pkg;
  } catch {
    return [];
  }
  const read = (block: unknown, dev: boolean): Dependency[] =>
    block && typeof block === "object"
      ? Object.entries(block as Record<string, unknown>).map(([name, version]) => ({
          ecosystem: "npm" as const,
          name,
          version: typeof version === "string" ? version : null,
          dev,
          manifest: file.path,
        }))
      : [];
  return [...read(pkg.dependencies, false), ...read(pkg.devDependencies, true)];
}

function fromRequirements(file: TextFile): Dependency[] {
  const dev = /dev|test/i.test(path.posix.basename(file.path));
  return file.content
    .split("\n")
    .map((line) => line.replace(/#.*/, "").trim())
    .filter((line) => line && !line.startsWith("-"))
    .map((line) => {
      const match = /^([A-Za-z0-9_.[\]-]+)\s*(.*)$/.exec(line);
      return {
        ecosystem: "pip" as const,
        name: (match?.[1] ?? line).replace(/\[.*\]/, ""),
        version: match?.[2]?.trim() || null,
        dev,
        manifest: file.path,
      };
    });
}

function fromPyproject(file: TextFile): Dependency[] {
  const block = /^dependencies\s*=\s*\[([\s\S]*?)\]/m.exec(file.content)?.[1] ?? "";
  return [...block.matchAll(/["']([A-Za-z0-9_.-]+)\s*([^"']*)["']/g)].map((m) => ({
    ecosystem: "pip" as const,
    name: m[1] ?? "",
    version: m[2]?.trim() || null,
    dev: false,
    manifest: file.path,
  }));
}

function fromGoMod(file: TextFile): Dependency[] {
  const lines = [
    ...(/require\s*\(([\s\S]*?)\)/.exec(file.content)?.[1] ?? "").split("\n"),
    ...[...file.content.matchAll(/^require\s+(\S+\s+\S+)/gm)].map((m) => m[1] ?? ""),
  ];
  return lines
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 2 && parts[0])
    .map(([name, version]) => ({
      ecosystem: "go" as const,
      name: name!,
      version: version ?? null,
      dev: false,
      manifest: file.path,
    }));
}

function fromCargo(file: TextFile): Dependency[] {
  const out: Dependency[] = [];
  for (const section of file.content.matchAll(
    /^\[(dev-)?dependencies\]([\s\S]*?)(?=^\[|$(?![\s\S]))/gm,
  )) {
    for (const line of (section[2] ?? "").split("\n")) {
      const match = /^([A-Za-z0-9_-]+)\s*=\s*(?:"([^"]+)"|\{.*version\s*=\s*"([^"]+)")/.exec(
        line.trim(),
      );
      if (match?.[1]) {
        out.push({
          ecosystem: "cargo",
          name: match[1],
          version: match[2] ?? match[3] ?? null,
          dev: Boolean(section[1]),
          manifest: file.path,
        });
      }
    }
  }
  return out;
}

export function readDependencies(files: TextFile[]): Dependency[] {
  const deps: Dependency[] = [];
  for (const file of files) {
    const name = path.posix.basename(file.path);
    if (name === "package.json") deps.push(...fromPackageJson(file));
    else if (/^requirements.*\.txt$/.test(name)) deps.push(...fromRequirements(file));
    else if (name === "pyproject.toml") deps.push(...fromPyproject(file));
    else if (name === "go.mod") deps.push(...fromGoMod(file));
    else if (name === "Cargo.toml") deps.push(...fromCargo(file));
  }
  return deps;
}
