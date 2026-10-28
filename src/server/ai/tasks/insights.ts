import { and, asc, desc, eq } from "drizzle-orm";
import { type Db, getDb } from "@/db/client";
import { alternatives, checklistItems, files, levels, reports } from "@/db/schema";
import { AlternativesSchema, type GapsOutput, GapsSchema } from "@/shared/contracts";
import { z } from "zod";
import { notFound } from "../../http";
import { getSettings } from "../../settings";
import { codeBundle } from "../code-bundle";
import { buildTutorRequest } from "../context";
import { runJsonTask } from "../json";
import type { AIProvider } from "../provider";
import { renderPrompt } from "../prompts";
import { getActiveProvider } from "../registry";

// Whole-project insights: design decisions with their alternatives, and
// lessons and gaps that feed the learner's reusable checklist.

const OptionsSchema = z.array(
  z.object({
    name: z.string(),
    pros: z.array(z.string()),
    cons: z.array(z.string()),
    pickWhen: z.string(),
    chosen: z.boolean(),
  }),
);

export function listAlternatives(db: Db, projectId: number) {
  return db
    .select()
    .from(alternatives)
    .where(eq(alternatives.projectId, projectId))
    .orderBy(asc(alternatives.id))
    .all()
    .map((row) => ({
      id: row.id,
      decision: row.decision,
      chosen: row.chosen,
      options: OptionsSchema.safeParse(row.options).data ?? [],
    }));
}
export type AlternativeView = ReturnType<typeof listAlternatives>[number];

export async function generateAlternatives(
  projectId: number,
  db: Db = getDb(),
  provider: AIProvider = getActiveProvider(db),
): Promise<AlternativeView[]> {
  const settings = getSettings(db);
  const request = buildTutorRequest({
    db,
    projectId,
    task: "alternatives",
    model: settings.tutorModel,
    instructions: renderPrompt("alternatives", {
      learner_name: settings.learnerName,
      code: codeBundle(db, { projectId, maxLines: 2000 }).text,
    }),
    messages: [
      { role: "user", content: "List the design decisions and their alternatives as JSON." },
    ],
    maxTokens: 4000,
  });
  const output = await runJsonTask({ provider, request, schema: AlternativesSchema });

  db.transaction(() => {
    db.delete(alternatives).where(eq(alternatives.projectId, projectId)).run();
    for (const d of output.decisions) {
      const option = (o: (typeof d.alternatives)[number], chosen: boolean) => ({
        name: o.name,
        pros: o.pros,
        cons: o.cons,
        pickWhen: o.pick_when,
        chosen,
      });
      db.insert(alternatives)
        .values({
          projectId,
          decision: d.decision,
          chosen: d.chosen.name,
          options: [option(d.chosen, true), ...d.alternatives.map((a) => option(a, false))],
        })
        .run();
    }
  });
  return listAlternatives(db, projectId);
}

export function getGapsReport(
  db: Db,
  projectId: number,
): (GapsOutput & { createdAt: Date }) | null {
  const row = db
    .select()
    .from(reports)
    .where(and(eq(reports.projectId, projectId), eq(reports.kind, "gaps")))
    .orderBy(desc(reports.createdAt), desc(reports.id))
    .get();
  const parsed = row ? GapsSchema.safeParse(row.data) : null;
  return row && parsed?.success ? { ...parsed.data, createdAt: row.createdAt } : null;
}

export async function generateGaps(
  projectId: number,
  db: Db = getDb(),
  provider: AIProvider = getActiveProvider(db),
): Promise<GapsOutput> {
  const settings = getSettings(db);
  const levelRows = db
    .select()
    .from(levels)
    .where(eq(levels.projectId, projectId))
    .orderBy(asc(levels.number))
    .all();
  const fileRows = db
    .select({ path: files.path, layer: files.layer, lineCount: files.lineCount })
    .from(files)
    .where(eq(files.projectId, projectId))
    .orderBy(asc(files.path))
    .all();
  if (fileRows.length === 0) throw notFound("Project");

  const request = buildTutorRequest({
    db,
    projectId,
    task: "gaps",
    model: settings.tutorModel,
    instructions: renderPrompt("gaps", {
      learner_name: settings.learnerName,
      roadmap:
        levelRows
          .map(
            (l) =>
              `- ${l.number}. ${l.name}${l.skipped ? " (SKIPPED in this project)" : ""}: ${l.goal}`,
          )
          .join("\n") || "(no roadmap yet)",
      files: fileRows
        .slice(0, 400)
        .map((f) => `- ${f.path} | ${f.layer} | ${f.lineCount} lines`)
        .join("\n"),
    }),
    messages: [{ role: "user", content: "List the lessons, gaps and checklist as JSON." }],
    maxTokens: 3500,
  });
  const output = await runJsonTask({ provider, request, schema: GapsSchema });

  db.transaction(() => {
    db.insert(reports).values({ projectId, kind: "gaps", data: output }).run();
    for (const item of output.checklist) {
      // The checklist grows across projects; the same advice is never added twice.
      db.insert(checklistItems)
        .values({
          projectId,
          title: item.title,
          whyItMatters: item.why_it_matters,
          source: item.source,
        })
        .onConflictDoNothing({ target: checklistItems.title })
        .run();
    }
  });
  return output;
}

export function listChecklist(db: Db = getDb()) {
  return db
    .select()
    .from(checklistItems)
    .orderBy(asc(checklistItems.done), asc(checklistItems.createdAt))
    .all();
}

export function setChecklistDone(id: number, done: boolean, db: Db = getDb()) {
  const row = db
    .update(checklistItems)
    .set({ done })
    .where(eq(checklistItems.id, id))
    .returning()
    .get();
  if (!row) throw notFound("Checklist item");
  return row;
}
