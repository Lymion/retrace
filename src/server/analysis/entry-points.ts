import path from "node:path";
import { z } from "zod";

// Finds where execution starts: the files a developer runs or opens first.
// Read from manifests and conventions only; nothing is executed.

const posix = path.posix;

interface TextFile {
  path: string;
  content: string;
}

const PackageJsonSchema = z
  .object({
    main: z.string().optional(),
    module: z.string().optional(),
    bin: z.union([z.string(), z.record(z.string(), z.string())]).optional(),
    scripts: z.record(z.string(), z.string()).optional(),
  })
  .passthrough();

function parsePackageJson(content: string) {
  try {
    const parsed = PackageJsonSchema.safeParse(JSON.parse(content));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function detectEntryPoints(files: TextFile[]): string[] {
  const paths = new Set(files.map((f) => f.path));
  const found = new Set<string>();
  const addIfExists = (candidate: string) => {
    const clean = posix.normalize(candidate).replace(/^\.\//, "");
    if (paths.has(clean)) found.add(clean);
  };

  for (const file of files) {
    const dir = posix.dirname(file.path);
    const inDir = (p: string) => (dir === "." ? p : posix.join(dir, p));
    const name = posix.basename(file.path);

    if (name === "package.json") {
      const pkg = parsePackageJson(file.content);
      if (!pkg) continue;
      if (pkg.main) addIfExists(inDir(pkg.main));
      if (pkg.module) addIfExists(inDir(pkg.module));
      const bins = typeof pkg.bin === "string" ? [pkg.bin] : Object.values(pkg.bin ?? {});
      bins.forEach((bin) => addIfExists(inDir(bin)));
      // "start": "node index.js", "dev": "nodemon src/server.ts", ...
      for (const script of ["start", "dev", "serve"]) {
        const command = pkg.scripts?.[script];
        if (!command) continue;
        for (const token of command.split(/\s+/)) {
          if (/\.(c|m)?[jt]sx?$/.test(token)) addIfExists(inDir(token));
        }
        // Vite, Parcel and friends start from index.html.
        if (/\b(vite|parcel|webpack serve)\b/.test(command)) addIfExists(inDir("index.html"));
      }
    }

    if (name === "index.html" && /<script[^>]+src=/i.test(file.content)) found.add(file.path);

    if (file.path.endsWith(".py")) {
      if (/^if\s+__name__\s*==\s*["']__main__["']\s*:/m.test(file.content)) found.add(file.path);
      if (["wsgi.py", "asgi.py", "manage.py"].includes(name) && dir === ".") found.add(file.path);
    }

    if (
      /^(src\/)?app\/page\.(t|j)sx?$/.test(file.path) ||
      /^(src\/)?pages\/index\.(t|j)sx?$/.test(file.path)
    ) {
      found.add(file.path);
    }
    if (name === "main.go" && /^package\s+main\b/m.test(file.content)) found.add(file.path);
    if (file.path.endsWith(".ino")) found.add(file.path);
  }

  return [...found].sort();
}
