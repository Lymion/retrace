// Builds everything the desktop installer needs, then runs electron-builder.
//   npm run dist           build the installer into release/
//   npm run dist -- --dir  build the unpacked app only (faster, for testing)
//
// 1. next build with standalone output (a server.js with only the files it needs)
// 2. copy beside it what the server reads at runtime: static files, Monaco,
//    prompts, migrations and the Claude Code binary for the Claude login
// 3. remove anything that must never ship: .env files, the local data folder
// 4. compile electron/*.ts, copy the icon, run electron-builder
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
const run = (command, env = {}) =>
  execSync(command, { stdio: "inherit", env: { ...process.env, ...env } });
const copy = (from, to) =>
  cpSync(path.join(root, from), path.join(standalone, to), { recursive: true, dereference: true });

rmSync(standalone, { recursive: true, force: true });
run("npx next build", { RETRACE_DESKTOP_BUILD: "1" });
if (!existsSync(path.join(standalone, "server.js")))
  throw new Error("next build made no standalone server.js");

copy("public", "public");
copy(".next/static", ".next/static");
copy("prompts", "prompts");
copy("drizzle", "drizzle");

// The Agent SDK starts Claude Code from its platform package. The file
// tracer does not see a spawned binary, so copy the package in.
for (const name of readdirSync(path.join(root, "node_modules", "@anthropic-ai"))) {
  if (!name.startsWith("claude-agent-sdk")) continue;
  copy(`node_modules/@anthropic-ai/${name}`, `node_modules/@anthropic-ai/${name}`);
}
// better-sqlite3 loads a prebuilt file by platform name; make sure it is there.
copy("node_modules/better-sqlite3/prebuilds", "node_modules/better-sqlite3/prebuilds");

// Never ship secrets or local data.
for (const name of readdirSync(standalone)) {
  if (name.startsWith(".env") || name === "data" || name === "release") {
    rmSync(path.join(standalone, name), { recursive: true, force: true });
    console.log(`removed ${name} from the build`);
  }
}

run("npm run electron:build");
writeFileSync(path.join(root, "electron", "dist", "package.json"), '{ "type": "commonjs" }\n');
mkdirSync(path.join(root, "installer"), { recursive: true });
cpSync(path.join(root, "src", "app", "favicon.ico"), path.join(root, "installer", "icon.ico"));

run(`npx electron-builder --win ${process.argv.slice(2).join(" ")}`.trim());
