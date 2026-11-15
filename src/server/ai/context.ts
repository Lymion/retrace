import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { concepts, files, learnerConcepts, levels, messages, projects } from "@/db/schema";
import { ProjectAnalysisSchema } from "@/shared/analysis";
import { buildFactSheet } from "../analysis/summary";
import { notFound } from "../http";
import { type Settings, getSettings } from "../settings";
import type { AIMessage, AIRequest } from "./provider";
import { renderPrompt } from "./prompts";

// Builds every tutor request in the brief's order: system prompt, project
// summary (cached), current level, open file, learner profile, then the last
// 10 messages. Uploaded code always travels inside <file> tags, which the
// system prompt marks as untrusted data.

export const FILE_LINE_BUDGET = 600;
const FOCUS_PADDING = 80;

/** Stops uploaded text from closing our <file> tag and posing as instructions. */
function neutralize(text: string): string {
  return text.replace(/<\/?file\b/gi, (tag) => tag.replace("<", "<\u200b"));
}

function numbered(lines: string[], start: number): string {
  return lines.map((text, i) => `${start + i}| ${text}`).join("\n");
}

/** Lines that name things (functions, classes, routes), used to sum up the part we leave out. */
const OUTLINE_LINE =
  /^\s*(export\s|async\s+function|function\s|class\s|def\s|@\w+(\.\w+)*\(|(const|let|var)\s+\w+\s*=\s*(async\s*)?(\(|function)|(router|app|bp)\.(get|post|put|patch|delete|use|route)\b|interface\s|type\s+\w+\s*=)/;

/** The declaration lines of a file (functions, classes, routes), as "line: text". */
export function outline(content: string, max = 20): string[] {
  return content
    .split("\n")
    .map((text, i) => ({ text, line: i + 1 }))
    .filter(({ text }) => OUTLINE_LINE.test(text))
    .slice(0, max)
    .map(({ text, line }) => `${line}: ${text.trim().slice(0, 140)}`);
}

export interface FocusRange {
  start: number;
  end: number;
}

/**
 * A file as the model sees it: numbered lines inside a <file> tag. Files over
 * the budget send the focused range (or the start) plus an outline of the rest.
 */
export function fileBlock(path: string, content: string, focus?: FocusRange): string {
  const lines = content.split("\n");
  const attrs = `path="${neutralize(path).replace(/"/g, "'")}" lines="${lines.length}"`;
  if (lines.length <= FILE_LINE_BUDGET) {
    return `<file ${attrs}>\n${neutralize(numbered(lines, 1))}\n</file>`;
  }

  const from = focus ? Math.max(1, focus.start - FOCUS_PADDING) : 1;
  const to = Math.min(lines.length, focus ? focus.end + FOCUS_PADDING : FILE_LINE_BUDGET / 2);
  const shown = lines.slice(from - 1, to);
  const outline = lines
    .map((text, i) => ({ text, line: i + 1 }))
    .filter(({ text, line }) => (line < from || line > to) && OUTLINE_LINE.test(text))
    .slice(0, 120)
    .map(({ text, line }) => `${line}: ${text.trim().slice(0, 140)}`)
    .join("\n");

  return [
    `<file ${attrs} shown="${from}-${to}">`,
    neutralize(numbered(shown, from)),
    "</file>",
    `Outline of the lines not shown above (line: declaration):`,
    neutralize(outline || "(no declarations found)"),
  ].join("\n");
}

export function factSheetFor(db: Db, projectId: number): string {
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) throw notFound("Project");
  const analysis = ProjectAnalysisSchema.safeParse(project.analysis);
  if (!analysis.success) return `# Project: ${project.name}\n(No analysis available.)`;
  return buildFactSheet(project.name, analysis.data, project.summary);
}

export function levelBlock(db: Db, levelId: number): string {
  const level = db.select().from(levels).where(eq(levels.id, levelId)).get();
  if (!level) return "";
  const levelFiles = db
    .select({ path: files.path })
    .from(files)
    .where(eq(files.levelId, levelId))
    .all()
    .map((f) => f.path);
  return [
    `## Current level: ${level.number}. ${level.name}${level.skipped ? " (the project skipped this level)" : ""}`,
    `Goal: ${level.goal}`,
    `Checkpoint: ${level.checkpoint}`,
    `Why this order: ${level.whyThisOrder}`,
    `Files in this level: ${levelFiles.join(", ") || "none"}`,
  ].join("\n");
}

const LANGUAGE_RULE: Record<Settings["replyLanguage"], string> = {
  auto: "Reply in the language the learner writes in (often a mix of English and Malay).",
  en: "Reply in English.",
  ms: "Reply in Malay (Bahasa Melayu). Keep code and technical terms in English.",
};

export function profileBlock(db: Db): string {
  const settings = getSettings(db);
  const rows = db
    .select({
      name: concepts.name,
      mastery: learnerConcepts.mastery,
      misses: learnerConcepts.misses,
      note: learnerConcepts.note,
    })
    .from(learnerConcepts)
    .innerJoin(concepts, eq(concepts.id, learnerConcepts.conceptId))
    .all();

  const strong = rows.filter((r) => r.mastery >= 0.7).map((r) => r.name);
  const weak = rows
    .filter((r) => r.mastery < 0.4 || r.misses >= 2)
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, 12)
    .map(
      (r) =>
        `${r.name} (mastery ${r.mastery.toFixed(2)}, missed ${r.misses}x${r.note ? `: ${r.note}` : ""})`,
    );

  return [
    "## Learner profile",
    `Name: ${settings.learnerName}. Explanation depth: ${settings.depth}.`,
    LANGUAGE_RULE[settings.replyLanguage],
    `Has mastered: ${strong.slice(0, 20).join(", ") || "nothing recorded yet"}.`,
    `Keeps missing: ${weak.join("; ") || "nothing recorded yet"}.`,
    weak.length
      ? "Spend extra care on the concepts they keep missing, and use a different analogy than before."
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Whole history budget, in characters (roughly 1,500 tokens). */
export const HISTORY_CHAR_BUDGET = 6000;
/** Longest an earlier chat message may be, in characters. */
export const MESSAGE_CHAR_CAP = 1500;

/** An earlier lesson shrunk to its first heading and first paragraph. */
export function shortenLesson(content: string): string {
  const blocks = content
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  const heading = blocks.find((b) => /^#{1,6}\s/.test(b));
  const paragraph = blocks.find((b) => !/^#{1,6}\s/.test(b) && !b.startsWith("```"));
  const kept = [heading, paragraph?.slice(0, 600)].filter(Boolean).join("\n\n");
  return `${kept}\n\n(Earlier lesson, shortened to save space.)`;
}

function capMessage(content: string): string {
  return content.length <= MESSAGE_CHAR_CAP
    ? content
    : `${content.slice(0, MESSAGE_CHAR_CAP)}\n(…shortened)`;
}

/**
 * The last chat messages for a project, oldest first: at most `limit`, and
 * at most HISTORY_CHAR_BUDGET characters in total. Earlier lessons are
 * shortened and long messages capped, because the model only needs the gist
 * of what was already said.
 */
export function recentMessages(db: Db, projectId: number, limit = 10): AIMessage[] {
  const rows = db
    .select({ role: messages.role, kind: messages.kind, content: messages.content })
    .from(messages)
    .where(and(eq(messages.projectId, projectId), inArray(messages.kind, ["chat", "lesson"])))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limit)
    .all();

  const kept: AIMessage[] = [];
  let used = 0;
  for (const row of rows) {
    const content = row.kind === "lesson" ? shortenLesson(row.content) : capMessage(row.content);
    if (used + content.length > HISTORY_CHAR_BUDGET) break;
    used += content.length;
    kept.push({ role: row.role, content });
  }
  kept.reverse();
  // Lessons are saved without a question before them. The conversation must
  // start with the learner speaking, so add a short opener instead of
  // dropping the lesson the next question is probably about.
  if (kept[0]?.role === "assistant") {
    kept.unshift({ role: "user", content: "(Start of our earlier conversation.)" });
  }
  return kept;
}

export interface TutorRequestInput {
  db: Db;
  projectId: number;
  task: string;
  model: string;
  /** Task instructions (one of the prompt files, already filled in). */
  instructions: string;
  levelId?: number | null;
  file?: { path: string; content: string; focus?: FocusRange } | null;
  /** Extra blocks the task adds after the open file (e.g. a level's files). */
  extra?: string[];
  messages: AIMessage[];
  maxTokens: number;
  /** Outside context (phase 13 ContextProviders), already formatted. */
  outside?: string[];
  /**
   * Set for requests that are likely to be followed by another with the same
   * start (chat turns, a lesson then questions). The level, open file and
   * `stable` blocks then come first so the provider can cache them.
   */
  cache?: boolean;
  /** Large blocks that repeat between requests (e.g. a level's files). */
  stable?: string[];
}

export function buildTutorRequest(input: TutorRequestInput): AIRequest {
  const settings = getSettings(input.db);
  const level = input.levelId ? levelBlock(input.db, input.levelId) : "";
  const file = input.file
    ? `## Open file\n${fileBlock(input.file.path, input.file.content, input.file.focus)}`
    : "";
  const join = (parts: (string | undefined)[]) => parts.filter(Boolean).join("\n\n");

  const base = {
    task: input.task,
    model: input.model,
    system: renderPrompt("system", { learner_name: settings.learnerName }),
    cachedContext: factSheetFor(input.db, input.projectId),
    messages: input.messages,
    maxTokens: input.maxTokens,
  };

  if (input.cache) {
    // Cache-friendly order: the big part that repeats from one turn to the
    // next (level, open file, the level's files) goes first, so it can be
    // reused; what changes per request (instructions, profile) comes after.
    return {
      ...base,
      cache: true,
      stableContext: join([level, file, ...(input.stable ?? [])]),
      context: join([
        input.instructions,
        ...(input.extra ?? []),
        profileBlock(input.db),
        ...(input.outside ?? []),
      ]),
    };
  }

  return {
    ...base,
    context: join([
      input.instructions,
      level,
      file,
      ...(input.stable ?? []),
      ...(input.extra ?? []),
      profileBlock(input.db),
      ...(input.outside ?? []),
    ]),
  };
}
