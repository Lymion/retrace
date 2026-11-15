import { and, desc, eq } from "drizzle-orm";
import { type Db, getDb } from "@/db/client";
import { challenges } from "@/db/schema";
import { RemixReviewSchema, RemixSchema } from "@/shared/contracts";
import { HttpError, notFound } from "../../http";
import { recordLearningEvent } from "../../learner/events";
import { applyReviewConcepts, difficultyRule } from "../../learner/profile";
import { getSettings } from "../../settings";
import { codeBundle } from "../code-bundle";
import { buildTutorRequest, fileBlock } from "../context";
import { runJsonTask } from "../json";
import type { AIProvider } from "../provider";
import { renderPrompt } from "../prompts";
import { modelFor } from "../models";
import { getActiveProvider } from "../registry";
import { type SubmittedFile, SubmittedFilesSchema } from "./rebuild";

// Remix challenges: the same patterns, a new domain, a starter skeleton
// with TODOs and three hints released one at a time. Never a full solution.

const SpecPart = RemixSchema.shape.spec;

function rowOr404(db: Db, projectId: number, challengeId: number) {
  const row = db
    .select()
    .from(challenges)
    .where(and(eq(challenges.id, challengeId), eq(challenges.projectId, projectId)))
    .get();
  if (!row) throw notFound("Challenge");
  return row;
}

/** The challenge as the learner sees it: only the hints already asked for. */
export function challengeView(row: typeof challenges.$inferSelect) {
  const spec = SpecPart.extend({
    title: RemixSchema.shape.title,
    domain: RemixSchema.shape.domain,
    patterns_reused: RemixSchema.shape.patterns_reused,
    files_needed: RemixSchema.shape.files_needed,
  }).parse(row.spec);
  return {
    id: row.id,
    title: row.title,
    spec,
    skeleton: SubmittedFilesSchema.safeParse(row.skeleton).data ?? [],
    attempt: SubmittedFilesSchema.safeParse(row.attempt).data ?? null,
    hints: row.hints.slice(0, row.hintsUsed),
    hintsUsed: row.hintsUsed,
    hintsTotal: row.hints.length,
    status: row.status,
    review: row.review ? (RemixReviewSchema.safeParse(row.review).data ?? null) : null,
  };
}
export type ChallengeView = ReturnType<typeof challengeView>;

export function latestChallenge(db: Db, projectId: number): ChallengeView | null {
  const row = db
    .select()
    .from(challenges)
    .where(eq(challenges.projectId, projectId))
    .orderBy(desc(challenges.createdAt), desc(challenges.id))
    .get();
  return row ? challengeView(row) : null;
}

export async function createChallenge(
  projectId: number,
  db: Db = getDb(),
  provider: AIProvider = getActiveProvider(db),
): Promise<ChallengeView> {
  const settings = getSettings(db);
  const request = buildTutorRequest({
    db,
    projectId,
    task: "remix",
    model: modelFor(settings, "tutor"),
    instructions: renderPrompt("remix", {
      learner_name: settings.learnerName,
      depth: settings.depth,
      difficulty_rule: difficultyRule(db),
      code: codeBundle(db, { projectId, maxLines: 1500 }).text,
    }),
    messages: [{ role: "user", content: "Design my remix challenge as JSON." }],
    maxTokens: 6000,
  });
  const remix = await runJsonTask({ provider, request, schema: RemixSchema });

  const row = db
    .insert(challenges)
    .values({
      projectId,
      title: remix.title,
      spec: {
        ...remix.spec,
        title: remix.title,
        domain: remix.domain,
        patterns_reused: remix.patterns_reused,
        files_needed: remix.files_needed,
      },
      skeleton: remix.skeleton,
      hints: remix.hints,
      attempt: remix.skeleton,
    })
    .returning()
    .get();
  return challengeView(row);
}

export function revealHint(
  projectId: number,
  challengeId: number,
  db: Db = getDb(),
): ChallengeView {
  const row = rowOr404(db, projectId, challengeId);
  if (row.hintsUsed >= row.hints.length) return challengeView(row);
  const updated = db
    .update(challenges)
    .set({ hintsUsed: row.hintsUsed + 1 })
    .where(eq(challenges.id, row.id))
    .returning()
    .get();
  return challengeView(updated);
}

export function saveChallengeDraft(
  projectId: number,
  challengeId: number,
  files: SubmittedFile[],
  db: Db = getDb(),
): ChallengeView {
  const row = rowOr404(db, projectId, challengeId);
  const updated = db
    .update(challenges)
    .set({ attempt: SubmittedFilesSchema.parse(files) })
    .where(eq(challenges.id, row.id))
    .returning()
    .get();
  return challengeView(updated);
}

export async function reviewChallenge(
  projectId: number,
  challengeId: number,
  submitted: SubmittedFile[],
  db: Db = getDb(),
  provider: AIProvider = getActiveProvider(db),
): Promise<ChallengeView> {
  const settings = getSettings(db);
  const row = rowOr404(db, projectId, challengeId);
  const files = SubmittedFilesSchema.parse(submitted);
  const skeleton = new Map(
    (SubmittedFilesSchema.safeParse(row.skeleton).data ?? []).map((f) => [f.path, f.content]),
  );
  if (files.every((f) => !f.content.trim() || skeleton.get(f.path) === f.content)) {
    throw new HttpError(400, "Fill in some of the TODOs before asking for a review.");
  }
  db.update(challenges)
    .set({ attempt: files, status: "submitted" })
    .where(eq(challenges.id, row.id))
    .run();

  const view = challengeView(row);
  const request = buildTutorRequest({
    db,
    projectId,
    task: "remix_review",
    model: modelFor(settings, "tutor"),
    instructions: renderPrompt("remix_review", {
      learner_name: settings.learnerName,
      challenge: JSON.stringify(view.spec, null, 2),
      hints_used: row.hintsUsed,
      learner_files: files.map((f) => fileBlock(`learner/${f.path}`, f.content)).join("\n\n"),
    }),
    messages: [{ role: "user", content: "Review my challenge attempt as JSON." }],
    maxTokens: 3000,
  });
  const review = await runJsonTask({ provider, request, schema: RemixReviewSchema });

  const updated = db
    .update(challenges)
    .set({ review, status: "reviewed" })
    .where(eq(challenges.id, row.id))
    .returning()
    .get();
  applyReviewConcepts(db, review.concepts);
  recordLearningEvent(db, {
    projectId,
    kind: "challenge",
    processed: true,
    detail: {
      challenge: row.title,
      passed: review.verdicts.filter((v) => v.passed).length,
      hintsUsed: row.hintsUsed,
      concepts: review.concepts,
    },
  });
  return challengeView(updated);
}
