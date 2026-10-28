import { and, asc, eq } from "drizzle-orm";
import { type Db, getDb } from "@/db/client";
import { annotations, files, levels } from "@/db/schema";
import { type AnnotateOutput, AnnotateSchema } from "@/shared/contracts";
import type { Depth } from "@/shared/enums";
import { notFound } from "../../http";
import { getSettings } from "../../settings";
import { FILE_LINE_BUDGET, buildTutorRequest } from "../context";
import { runJsonTask } from "../json";
import type { AIProvider } from "../provider";
import { renderPrompt } from "../prompts";
import { getActiveProvider } from "../registry";

// annotate: one file, its level, depth -> 10 to 15 line notes.
// Notes are cached per file and depth, so reopening a file costs nothing.

export const MAX_NOTES = 15;

export function listAnnotations(fileId: number, depth: Depth, db: Db = getDb()) {
  return db
    .select()
    .from(annotations)
    .where(and(eq(annotations.fileId, fileId), eq(annotations.depth, depth)))
    .orderBy(asc(annotations.startLine))
    .all();
}
export type AnnotationRow = ReturnType<typeof listAnnotations>[number];

/** Keeps only notes that point at real lines, one note per line, at most 15. */
export function cleanAnnotations(output: AnnotateOutput, lineCount: number) {
  const seen = new Set<number>();
  return output.annotations
    .filter((a) => a.line <= lineCount && !seen.has(a.line) && seen.add(a.line))
    .slice(0, MAX_NOTES)
    .map((a) => ({
      startLine: a.line,
      endLine: Math.min(Math.max(a.end_line ?? a.line, a.line), lineCount),
      note: a.note,
      category: a.category,
    }))
    .sort((a, b) => a.startLine - b.startLine);
}

/** How many notes a file deserves: a 6-line config file does not need 10. */
function noteRange(lineCount: number): { min: number; max: number } {
  if (lineCount < 15) return { min: 1, max: 4 };
  if (lineCount < 40) return { min: 4, max: 10 };
  return { min: 10, max: MAX_NOTES };
}

export async function annotateFile(
  projectId: number,
  fileId: number,
  options: { depth?: Depth; regenerate?: boolean } = {},
  db: Db = getDb(),
  provider: AIProvider = getActiveProvider(db),
): Promise<AnnotationRow[]> {
  const settings = getSettings(db);
  const depth = options.depth ?? settings.depth;
  const file = db
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.projectId, projectId)))
    .get();
  if (!file) throw notFound("File");

  const cached = listAnnotations(fileId, depth, db);
  if (cached.length > 0 && !options.regenerate) return cached;
  if (file.lineCount < 2 || file.content.trim() === "") return [];

  const level = file.levelId
    ? db.select().from(levels).where(eq(levels.id, file.levelId)).get()
    : undefined;
  const { min, max } = noteRange(Math.min(file.lineCount, FILE_LINE_BUDGET));
  const request = buildTutorRequest({
    db,
    projectId,
    task: "annotate",
    model: settings.fastModel,
    instructions: renderPrompt("annotate", {
      learner_name: settings.learnerName,
      depth,
      min_notes: min,
      max_notes: max,
      level_name: level ? `${level.number}. ${level.name}` : "(no roadmap yet)",
    }),
    levelId: file.levelId,
    file: { path: file.path, content: file.content },
    messages: [{ role: "user", content: `Annotate ${file.path} as JSON.` }],
    maxTokens: 2500,
  });

  const output = await runJsonTask({ provider, request, schema: AnnotateSchema });
  const notes = cleanAnnotations(output, file.lineCount);

  db.transaction((tx) => {
    tx.delete(annotations)
      .where(and(eq(annotations.fileId, fileId), eq(annotations.depth, depth)))
      .run();
    if (notes.length)
      tx.insert(annotations)
        .values(notes.map((n) => ({ ...n, fileId, depth })))
        .run();
  });
  return listAnnotations(fileId, depth, db);
}
