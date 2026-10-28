import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setDbForTests, type Db } from "@/db/client";
import { learningEvents, projects } from "@/db/schema";
import { createTestDb } from "@tests/helpers/db";
import { FakeProvider, fixture } from "@tests/helpers/fake-provider";
import { buildTutorRequest } from "../ai/context";
import { recordLearningEvent } from "./events";
import {
  CHAT_BATCH,
  applyResult,
  applyReviewConcepts,
  listProfile,
  updateProfileFromChat,
} from "./profile";

let db: Db;
let projectId: number;

beforeEach(() => {
  db = createTestDb();
  projectId = db
    .insert(projects)
    .values({ name: "todo", source: "zip", sourceRef: "t.zip" })
    .returning()
    .get().id;
});
afterEach(() => setDbForTests(undefined));

const mastery = (name: string) => listProfile(db).find((c) => c.name === name)?.mastery;

function askQuestions(count: number) {
  for (let i = 0; i < count; i++) {
    recordLearningEvent(db, {
      projectId,
      kind: "chat",
      detail: { question: `Kenapa search query bahaya? (${i})` },
    });
  }
}

describe("structured results", () => {
  it("scores concepts from a rebuild review straight away", () => {
    applyReviewConcepts(db, [
      { name: "Express Router", layer: "backend", result: "solid", note: "good" },
      { name: "input validation", layer: "backend", result: "missed", note: "no checks" },
    ]);
    expect(mastery("express router")).toBeCloseTo(0.7);
    expect(mastery("input validation")).toBeCloseTo(0.15);
    expect(listProfile(db)[0]!.name).toBe("input validation"); // weakest first
  });

  it("moves mastery with later results and stays between 0 and 1", () => {
    for (let i = 0; i < 10; i++) applyResult(db, "jwt", "security", "correct");
    expect(mastery("jwt")).toBe(1);
    for (let i = 0; i < 20; i++) applyResult(db, "jwt", "security", "wrong");
    expect(mastery("jwt")).toBe(0);
    const row = listProfile(db).find((c) => c.name === "jwt")!;
    expect([row.hits, row.misses]).toEqual([10, 20]);
  });
});

describe("profile_update from chat", () => {
  it("waits for a batch of questions", async () => {
    askQuestions(CHAT_BATCH - 1);
    const provider = new FakeProvider("api-key", [fixture("profile-update.json")]);
    expect(await updateProfileFromChat({}, db, provider)).toBe(0);
    expect(provider.requests).toHaveLength(0);
  });

  it("turns questions into mastery changes with notes, on the fast model, once", async () => {
    askQuestions(CHAT_BATCH);
    const provider = new FakeProvider("api-key", [fixture("profile-update.json")]);
    expect(await updateProfileFromChat({}, db, provider)).toBe(2);

    expect(provider.requests[0]!.model).toBe("claude-haiku-5-5");
    expect(provider.requests[0]!.context).toContain("Kenapa search query bahaya?");
    expect(mastery("sql injection")).toBeCloseTo(0.35);
    expect(listProfile(db).find((c) => c.name === "sql injection")!.note).toMatch(/cashier/);
    expect(
      db
        .select()
        .from(learningEvents)
        .all()
        .every((e) => e.processedAt !== null),
    ).toBe(true);
    // Nothing left to process.
    expect(await updateProfileFromChat({ force: true }, db, provider)).toBe(0);
  });
});

describe("the tutor adapts", () => {
  it("puts what the learner keeps missing into the next request", () => {
    const before = buildTutorRequest({
      db,
      projectId,
      task: "chat",
      model: "m",
      instructions: "TASK",
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 10,
    });
    expect(before.context).toContain("Keeps missing: nothing recorded yet");

    // Session 1: a rebuild review finds a weak spot.
    applyReviewConcepts(db, [
      {
        name: "parameterised queries",
        layer: "security",
        result: "missed",
        note: "built SQL from strings",
      },
    ]);
    // Session 2: the next explanation is told about it.
    const after = buildTutorRequest({
      db,
      projectId,
      task: "chat",
      model: "m",
      instructions: "TASK",
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 10,
    });
    expect(after.context).toContain(
      "parameterised queries (mastery 0.15, missed 1x: built SQL from strings)",
    );
    expect(after.context).toContain("use a different analogy");
  });
});
