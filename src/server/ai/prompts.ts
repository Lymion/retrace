import { readFileSync, statSync } from "node:fs";
import path from "node:path";

// Prompt files live in /prompts as plain markdown so they can be read and
// improved without touching code. {placeholders} are filled at call time.

export const PROMPT_NAMES = [
  "system",
  "roadmap",
  "annotate",
  "teach_level",
  "chat",
  "rebuild_spec",
  "rebuild_review",
  "security_audit",
  "alternatives",
  "gaps",
  "quiz_generate",
  "quiz_grade",
  "remix",
  "remix_review",
  "profile_update",
] as const;
export type PromptName = (typeof PROMPT_NAMES)[number];

const PROMPTS_DIR = path.join(process.cwd(), "prompts");
const cache = new Map<PromptName, { mtimeMs: number; text: string }>();

export function loadPrompt(name: PromptName): string {
  const file = path.join(PROMPTS_DIR, `${name}.md`);
  // Re-read when the file changes, so editing a prompt needs no restart.
  const { mtimeMs } = statSync(file);
  const hit = cache.get(name);
  if (hit && hit.mtimeMs === mtimeMs) return hit.text;
  const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n").trim();
  cache.set(name, { mtimeMs, text });
  return text;
}

/** Replaces {name} with values. Unknown placeholders are left alone so typos show up. */
export function fillPrompt(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{([a-z_]+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}

export function renderPrompt(
  name: PromptName,
  values: Record<string, string | number> = {},
): string {
  return fillPrompt(loadPrompt(name), values);
}
