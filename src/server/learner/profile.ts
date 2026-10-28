import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { type Db, getDb } from "@/db/client";
import { concepts, learnerConcepts, learningEvents } from "@/db/schema";
import { ProfileUpdateSchema } from "@/shared/contracts";
import type { Layer } from "@/shared/enums";
import { runJsonTask } from "../ai/json";
import type { AIProvider } from "../ai/provider";
import { renderPrompt } from "../ai/prompts";
import { getActiveProvider } from "../ai/registry";
import { profileBlock } from "../ai/context";
import { getSettings } from "../settings";

// The learner profile: one mastery score (0 to 1) per concept.
//
// Structured results move it straight away, without AI: a rebuild review
// says solid/shaky/missed, a quiz answer is right or wrong. Chat questions
// have no score, so they are batched and the profile_update task decides
// what they say about the learner, with a short note per change.

/** Where a concept starts the first time we see it, by result. */
const FIRST_SEEN = { solid: 0.7, shaky: 0.4, missed: 0.15, correct: 0.6, wrong: 0.25 } as const;
/** How much a later result moves it. */
const STEP = { solid: 0.15, shaky: -0.05, missed: -0.15, correct: 0.1, wrong: -0.1 } as const;
export type Result = keyof typeof STEP;

/** Chat questions wait for a batch this big before an AI profile update. */
export const CHAT_BATCH = 6;

export function normalizeConcept(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 60);
}

const clamp = (n: number) => Math.min(1, Math.max(0, n));

/** The id of a concept, creating it the first time it is named. */
export function conceptId(db: Db, name: string, layer: Layer): number {
  const normalized = normalizeConcept(name);
  const existing = db.select().from(concepts).where(eq(concepts.name, normalized)).get();
  if (existing) return existing.id;
  return db
    .insert(concepts)
    .values({ name: normalized, layer })
    .returning({ id: concepts.id })
    .get().id;
}

/** Moves one concept's mastery. `delta` null means "first time seen": use `start`. */
export function changeMastery(
  db: Db,
  change: { concept: string; layer: Layer; delta: number; start: number; note?: string | null },
): void {
  if (!normalizeConcept(change.concept)) return;
  const id = conceptId(db, change.concept, change.layer);
  const current = db.select().from(learnerConcepts).where(eq(learnerConcepts.conceptId, id)).get();
  const positive = change.delta >= 0;
  if (!current) {
    db.insert(learnerConcepts)
      .values({
        conceptId: id,
        mastery: clamp(change.start),
        hits: positive ? 1 : 0,
        misses: positive ? 0 : 1,
        note: change.note ?? null,
        lastSeenAt: new Date(),
      })
      .run();
    return;
  }
  db.update(learnerConcepts)
    .set({
      mastery: clamp(current.mastery + change.delta),
      hits: current.hits + (positive ? 1 : 0),
      misses: current.misses + (positive ? 0 : 1),
      note: change.note ?? current.note,
      lastSeenAt: new Date(),
    })
    .where(eq(learnerConcepts.conceptId, id))
    .run();
}

export function applyResult(
  db: Db,
  concept: string,
  layer: Layer,
  result: Result,
  note?: string | null,
): void {
  changeMastery(db, { concept, layer, delta: STEP[result], start: FIRST_SEEN[result], note });
}

/** A rebuild (or remix) review: each concept it names moves by its result. */
export function applyReviewConcepts(
  db: Db,
  reviewed: { name: string; layer: Layer; result: "solid" | "shaky" | "missed"; note: string }[],
): void {
  for (const c of reviewed) applyResult(db, c.name, c.layer, c.result, c.note);
}

/** How hard quizzes and challenges should be, from the learner's average mastery. */
export function difficultyRule(db: Db): string {
  const rows = listProfile(db);
  if (rows.length < 3) return "Little is known about the learner yet: start gently and build up.";
  const average = rows.reduce((sum, r) => sum + r.mastery, 0) / rows.length;
  if (average < 0.4)
    return "The learner is still building the basics: keep it gentle and concrete.";
  if (average < 0.7) return "The learner knows the basics: aim for medium difficulty.";
  return "The learner is doing well: make it challenging, with edge cases.";
}

export function listProfile(db: Db = getDb()) {
  return db
    .select({
      name: concepts.name,
      layer: concepts.layer,
      mastery: learnerConcepts.mastery,
      hits: learnerConcepts.hits,
      misses: learnerConcepts.misses,
      note: learnerConcepts.note,
      lastSeenAt: learnerConcepts.lastSeenAt,
    })
    .from(learnerConcepts)
    .innerJoin(concepts, eq(concepts.id, learnerConcepts.conceptId))
    .orderBy(asc(learnerConcepts.mastery), asc(concepts.name))
    .all();
}

function pendingChatEvents(db: Db) {
  return db
    .select()
    .from(learningEvents)
    .where(and(eq(learningEvents.kind, "chat"), isNull(learningEvents.processedAt)))
    .orderBy(desc(learningEvents.createdAt))
    .limit(40)
    .all();
}

/**
 * Turns pending chat questions into mastery changes. Runs once a batch is
 * big enough, or straight away when `force` is set (the "update now" button).
 * Returns how many concepts changed.
 */
export async function updateProfileFromChat(
  options: { force?: boolean } = {},
  db: Db = getDb(),
  provider: AIProvider = getActiveProvider(db),
): Promise<number> {
  const events = pendingChatEvents(db);
  if (events.length === 0 || (!options.force && events.length < CHAT_BATCH)) return 0;
  const settings = getSettings(db);

  const output = await runJsonTask({
    provider,
    schema: ProfileUpdateSchema,
    request: {
      task: "profile_update",
      model: settings.fastModel,
      system: renderPrompt("system", { learner_name: settings.learnerName }),
      context: renderPrompt("profile_update", {
        learner_name: settings.learnerName,
        profile: profileBlock(db),
        events: events
          .reverse()
          .map((e) => `- ${JSON.stringify(e.detail)}`)
          .join("\n"),
      }),
      messages: [{ role: "user", content: "Update my learner profile as JSON." }],
      maxTokens: 1500,
    },
  });

  // better-sqlite3 runs everything on one connection, so these statements
  // all belong to the transaction even though they go through `db`.
  db.transaction(() => {
    for (const change of output.changes) {
      // A concept met for the first time through chat starts in the middle.
      changeMastery(db, {
        concept: change.concept,
        layer: change.layer,
        delta: change.delta,
        start: 0.5 + change.delta,
        note: change.note,
      });
    }
    for (const event of events) {
      db.update(learningEvents)
        .set({ processedAt: new Date() })
        .where(eq(learningEvents.id, event.id))
        .run();
    }
  });
  return output.changes.length;
}
