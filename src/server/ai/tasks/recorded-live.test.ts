import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setDbForTests, type Db } from "@/db/client";
import { createTestDb } from "@tests/helpers/db";
import { FakeProvider, fixture } from "@tests/helpers/fake-provider";
import { buildTodoZip } from "@tests/helpers/sample-zips";
import { writeTempZip } from "@tests/helpers/zips";
import { analyzeAfterStore } from "../../analysis/analyze";
import { ingestZip } from "../../ingest/ingest";
import { getFileContent, listFiles, listLevels } from "../../repo/projects";
import { annotateFile } from "./annotate";
import { createRebuildSpec, reviewRebuild } from "./rebuild";
import { generateRoadmap } from "./roadmap";
import { prepareChat } from "./tutor";

// Real replies from Claude (recorded with `npm run live-check -- --yes --record`
// on the to-do sample, through the claude-login provider). These tests prove
// real model output passes the same schemas and guards as the hand-written
// fixtures, without calling the API.

const live = (name: string) => fixture(`live/${name}`);

let db: Db;
let projectId: number;

beforeEach(async () => {
  db = createTestDb();
  projectId = await ingestZip(
    {
      zipPath: writeTempZip(await buildTodoZip()),
      name: "todo-express-react",
      source: "zip",
      sourceRef: "todo-express-react.zip",
      afterStore: analyzeAfterStore({ kind: "zip" }),
    },
    db,
  );
  await generateRoadmap(projectId, db, new FakeProvider("claude-login", [live("01-roadmap.txt")]));
});
afterEach(() => setDbForTests(undefined));

describe("real recorded replies", () => {
  it("roadmap: follows the git history and marks the missing levels", () => {
    const levels = listLevels(projectId, db);
    expect(levels).toHaveLength(13);
    expect(levels.filter((l) => l.skipped).map((l) => l.name)).toEqual([
      "Feature logic",
      "Validation and errors",
      "Testing",
      "Security hardening",
      "Polish",
      "Ship and maintain",
    ]);
    expect(levels.filter((l) => !l.skipped).every((l) => l.evidence === "git")).toBe(true);
    expect(listFiles(projectId, db).every((f) => f.levelId !== null)).toBe(true);
  });

  it("annotate: notes on real lines, with same-line notes merged instead of dropped", async () => {
    const todos = listFiles(projectId, db).find((f) => f.path === "server/routes/todos.js")!;
    const notes = await annotateFile(
      projectId,
      todos.id,
      { depth: "beginner" },
      db,
      new FakeProvider("claude-login", [live("02-annotate.txt")]),
    );
    expect(notes.length).toBeGreaterThanOrEqual(10);
    expect(notes.length).toBeLessThanOrEqual(15);
    expect(notes.every((n) => n.startLine <= todos.lineCount)).toBe(true);
    expect(new Set(notes.map((n) => n.startLine)).size).toBe(notes.length);
    // The model wrote the SQL injection problem and its fix as two notes on L16.
    const injection = notes.find((n) => n.startLine === 16)!;
    expect(injection.category).toBe("security");
    expect(injection.note).toMatch(/pasted straight into the SQL/);
    expect(injection.note).toMatch(/Fix:/);
  });

  it("chat: the streamed reply answers in Malay and points at the right line", async () => {
    const todos = listFiles(projectId, db).find((f) => f.path === "server/routes/todos.js")!;
    const provider = new FakeProvider("claude-login", [live("03-chat.txt")]);
    const task = prepareChat(
      { projectId, fileId: todos.id, message: "Kenapa /search route ni bahaya?" },
      db,
      provider,
    );
    let text = "";
    for await (const chunk of task.provider.stream(task.request)) text += chunk;
    expect(text).toMatch(/SQL injection/);
    expect(text).toMatch(/`server\/routes\/todos\.js` L16/);
    expect(text).toMatch(/bahaya|Bayangkan/);
    expect(text.trim().endsWith("?")).toBe(true); // ends with a check-for-understanding question
  });

  it("rebuild: the real spec (once rejected for a long purpose) passes, quotes no code, and the review cites the original", async () => {
    const setup = listLevels(projectId, db).find((l) => l.name === "Project setup")!;
    const specProvider = new FakeProvider("claude-login", [live("04-rebuild_spec.txt")]);
    const attempt = await createRebuildSpec(projectId, setup.id, db, specProvider);
    expect(specProvider.requests).toHaveLength(1); // accepted first time with the 800-character limit
    expect(attempt.spec.acceptance_checks.map((c) => c.id)).toEqual(["A1", "A2", "A3"]);

    const files = attempt.files.map((f) => {
      const original = listFiles(projectId, db).find((o) => o.path === f.path)!;
      return { path: f.path, content: getFileContent(projectId, original.id, db).content };
    });
    const reviewed = await reviewRebuild(
      projectId,
      attempt.id,
      files,
      db,
      new FakeProvider("claude-login", [live("06-rebuild_review.txt")]),
    );
    expect(reviewed.review?.verdicts.every((v) => v.passed)).toBe(true);
    expect(reviewed.review?.summary).toMatch(/Haykal/);
  });
});
