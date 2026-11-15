import { and, asc, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { type Db, getDb } from "@/db/client";
import { files, levels, rebuildAttempts } from "@/db/schema";
import {
  type RebuildReview,
  RebuildReviewSchema,
  type RebuildSpec,
  RebuildSpecSchema,
} from "@/shared/contracts";
import { HttpError, notFound } from "../../http";
import { getSettings } from "../../settings";
import { buildTutorRequest, fileBlock, outline } from "../context";
import { runJsonTask } from "../json";
import type { AIProvider } from "../provider";
import { renderPrompt } from "../prompts";
import { modelFor } from "../models";
import { getActiveProvider } from "../registry";
import { recordLearningEvent } from "../../learner/events";
import { applyReviewConcepts } from "../../learner/profile";

// Rebuild mode: a spec without the original code, the learner's files, and
// a review that compares them with the original. "Different is not wrong":
// the review flags only spec breaks, bugs and security gaps.

export const SubmittedFilesSchema = z
  .array(
    z.object({
      path: z
        .string()
        .trim()
        .min(1)
        .max(300)
        .refine(
          (p) => !p.includes("..") && !p.startsWith("/") && !/^[a-z]:/i.test(p),
          "Use a relative file path.",
        ),
      content: z.string().max(200_000, "A file can be at most 200,000 characters."),
    }),
  )
  .max(30, "At most 30 files per rebuild.");
export type SubmittedFile = z.infer<typeof SubmittedFilesSchema>[number];

/** Lines shorter than this are too generic ("res.json(todos);") to count as copying. */
const MIN_QUOTED_LINE = 30;

/** The first long original line that appears in `text`, or null. Used to keep specs code-free. */
export function quotedOriginalLine(text: string, originals: string[]): string | null {
  const haystack = text.replace(/\s+/g, " ");
  for (const content of originals) {
    for (const raw of content.split("\n")) {
      const line = raw.trim().replace(/\s+/g, " ");
      if (line.length >= MIN_QUOTED_LINE && !line.includes("«REDACTED") && haystack.includes(line))
        return line;
    }
  }
  return null;
}

/** Every string inside a JSON value, unescaped, so quotes in code still match. */
export function allText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(allText).join("\n");
  if (value && typeof value === "object") return Object.values(value).map(allText).join("\n");
  return "";
}

function levelOr404(db: Db, projectId: number, levelId: number) {
  const level = db
    .select()
    .from(levels)
    .where(and(eq(levels.id, levelId), eq(levels.projectId, projectId)))
    .get();
  if (!level) throw notFound("Level");
  return level;
}

function levelFiles(db: Db, levelId: number) {
  return db.select().from(files).where(eq(files.levelId, levelId)).orderBy(asc(files.path)).all();
}

/** Files from the levels before this one: what the learner already has. */
function earlierFiles(db: Db, projectId: number, levelNumber: number) {
  return db
    .select({ path: files.path, content: files.content, number: levels.number })
    .from(files)
    .innerJoin(levels, eq(levels.id, files.levelId))
    .where(and(eq(files.projectId, projectId), lt(levels.number, levelNumber)))
    .orderBy(asc(levels.number), asc(files.path))
    .all();
}

export function getLatestAttempt(db: Db, levelId: number) {
  return (
    db
      .select()
      .from(rebuildAttempts)
      .where(eq(rebuildAttempts.levelId, levelId))
      .orderBy(desc(rebuildAttempts.createdAt), desc(rebuildAttempts.id))
      .get() ?? null
  );
}

export function parseAttempt(row: typeof rebuildAttempts.$inferSelect) {
  return {
    id: row.id,
    levelId: row.levelId,
    status: row.status,
    spec: RebuildSpecSchema.parse(row.spec),
    files: SubmittedFilesSchema.safeParse(row.submittedFiles).data ?? [],
    review: row.review ? (RebuildReviewSchema.safeParse(row.review).data ?? null) : null,
    createdAt: row.createdAt,
  };
}
export type AttemptView = ReturnType<typeof parseAttempt>;

export async function createRebuildSpec(
  projectId: number,
  levelId: number,
  db: Db = getDb(),
  provider: AIProvider = getActiveProvider(db),
): Promise<AttemptView> {
  const settings = getSettings(db);
  const level = levelOr404(db, projectId, levelId);
  const originals = levelFiles(db, levelId);
  const earlier = earlierFiles(db, projectId, level.number);

  const request = buildTutorRequest({
    db,
    projectId,
    task: "rebuild_spec",
    model: modelFor(settings, "tutor"),
    instructions: renderPrompt("rebuild_spec", {
      learner_name: settings.learnerName,
      level_label: `${level.number}: ${level.name}`,
      depth: settings.depth,
      skipped_rule: level.skipped
        ? "The original project SKIPPED this level, so there are no original files. Design the files the project should have had for this level, at the paths that fit the project's structure."
        : "",
      earlier_files:
        earlier
          .slice(0, 60)
          .map(
            (f) =>
              `- ${f.path} (level ${f.number})${outline(f.content, 8)
                .map((l) => `\n    ${l}`)
                .join("")}`,
          )
          .join("\n") || "(none)",
      level_files:
        originals.map((f) => fileBlock(f.path, f.content)).join("\n\n") || "(no original files)",
    }),
    levelId,
    messages: [{ role: "user", content: "Write the rebuild spec as JSON." }],
    maxTokens: 3000,
  });

  const contents = originals.map((f) => f.content);
  const spec: RebuildSpec = await runJsonTask({
    provider,
    request,
    schema: RebuildSpecSchema,
    check: (data) => {
      const quoted = quotedOriginalLine(allText(data), contents);
      return quoted
        ? `The spec quotes the original code ("${quoted.slice(0, 80)}"). Describe the behaviour instead, with no code from the original.`
        : null;
    },
  });

  const row = db
    .insert(rebuildAttempts)
    .values({
      projectId,
      levelId,
      spec,
      submittedFiles: spec.files_to_write.map((f) => ({ path: f.path, content: "" })),
      status: "spec",
    })
    .returning()
    .get();
  return parseAttempt(row);
}

function attemptOr404(db: Db, projectId: number, attemptId: number) {
  const row = db
    .select()
    .from(rebuildAttempts)
    .where(and(eq(rebuildAttempts.id, attemptId), eq(rebuildAttempts.projectId, projectId)))
    .get();
  if (!row) throw notFound("Rebuild attempt");
  return row;
}

export function saveDraft(
  projectId: number,
  attemptId: number,
  draft: SubmittedFile[],
  db: Db = getDb(),
): AttemptView {
  const row = attemptOr404(db, projectId, attemptId);
  const valid = SubmittedFilesSchema.parse(draft);
  const updated = db
    .update(rebuildAttempts)
    .set({ submittedFiles: valid })
    .where(eq(rebuildAttempts.id, row.id))
    .returning()
    .get();
  return parseAttempt(updated);
}

/** Keeps citations only when they point at a real original file; strips our path prefixes. */
export function cleanReview(review: RebuildReview, originalPaths: Set<string>): RebuildReview {
  const strip = (p: string) => p.replace(/^(original|learner)\//, "");
  const cite = <T extends { file: string; line?: number | null } | null | undefined>(ref: T) => {
    if (!ref) return null;
    const file = strip(ref.file);
    return originalPaths.has(file) ? { file, line: ref.line ?? null } : null;
  };
  return {
    ...review,
    verdicts: review.verdicts.map((v) => ({ ...v, original: cite(v.original) })),
    bugs: review.bugs.map((b) => ({ ...b, file: strip(b.file), original: cite(b.original) })),
    security_gaps: review.security_gaps.map((g) => ({ ...g, file: strip(g.file) })),
    approach_differences: review.approach_differences.map((d) => ({
      ...d,
      original_ref: cite(d.original_ref),
    })),
  };
}

export async function reviewRebuild(
  projectId: number,
  attemptId: number,
  submitted: SubmittedFile[],
  db: Db = getDb(),
  provider: AIProvider = getActiveProvider(db),
): Promise<AttemptView> {
  const settings = getSettings(db);
  const row = attemptOr404(db, projectId, attemptId);
  const learnerFiles = SubmittedFilesSchema.parse(submitted).filter((f) => f.content.trim() !== "");
  if (learnerFiles.length === 0)
    throw new HttpError(400, "Write at least one file before asking for a review.");
  const attempt = parseAttempt(row);
  const level = levelOr404(db, projectId, row.levelId);
  const originals = levelFiles(db, row.levelId);

  db.update(rebuildAttempts)
    .set({ submittedFiles: SubmittedFilesSchema.parse(submitted), status: "submitted" })
    .where(eq(rebuildAttempts.id, row.id))
    .run();

  const request = buildTutorRequest({
    db,
    projectId,
    task: "rebuild_review",
    model: modelFor(settings, "tutor"),
    instructions: renderPrompt("rebuild_review", {
      learner_name: settings.learnerName,
      level_label: `${level.number}: ${level.name}`,
      spec: JSON.stringify(attempt.spec, null, 2),
      learner_files: learnerFiles
        .map((f) => fileBlock(`learner/${f.path}`, f.content))
        .join("\n\n"),
      original_files: originals.length
        ? originals.map((f) => fileBlock(`original/${f.path}`, f.content)).join("\n\n")
        : "(The original project skipped this level: judge against the spec only.)",
    }),
    levelId: row.levelId,
    messages: [{ role: "user", content: "Review my rebuild as JSON." }],
    maxTokens: 4000,
  });

  const review = cleanReview(
    await runJsonTask({ provider, request, schema: RebuildReviewSchema }),
    new Set(originals.map((f) => f.path)),
  );

  const updated = db
    .update(rebuildAttempts)
    .set({ review, status: "reviewed" })
    .where(eq(rebuildAttempts.id, row.id))
    .returning()
    .get();
  if (level.status !== "done") {
    db.update(levels).set({ status: "rebuilt" }).where(eq(levels.id, level.id)).run();
  }
  // A review scores each concept, so the profile moves right away, no AI needed.
  applyReviewConcepts(db, review.concepts);
  recordLearningEvent(db, {
    projectId,
    kind: "rebuild_review",
    processed: true,
    detail: {
      level: `${level.number}. ${level.name}`,
      passed: review.verdicts.filter((v) => v.passed).length,
      checks: review.verdicts.length,
      bugs: review.bugs.length,
      securityGaps: review.security_gaps.length,
      concepts: review.concepts,
    },
  });
  return parseAttempt(updated);
}
