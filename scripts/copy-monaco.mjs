// Copies Monaco's prebuilt files into /public so the editor loads from our own
// origin. Loading it from a CDN would force us to loosen the Content Security Policy.
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "monaco-editor", "min", "vs");
const target = join(root, "public", "monaco", "vs");

if (!existsSync(source)) {
  console.warn("[copy-monaco] monaco-editor/min/vs not found; skipping copy.");
  process.exit(0);
}

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
console.log("[copy-monaco] copied Monaco to public/monaco/vs");
