import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setDbForTests, type Db } from "@/db/client";
import { createTestDb } from "@tests/helpers/db";
import { FakeProvider, fixture } from "@tests/helpers/fake-provider";
import { buildTodoZip } from "@tests/helpers/sample-zips";
import { writeTempZip } from "@tests/helpers/zips";
import { analyzeAfterStore } from "../../analysis/analyze";
import { ingestZip } from "../../ingest/ingest";
import { listFiles } from "../../repo/projects";
import { annotateFile } from "./annotate";

let db: Db;
let projectId: number;
let todosFileId: number;

beforeEach(async () => {
  db = createTestDb();
  projectId = await ingestZip(
    {
      zipPath: writeTempZip(await buildTodoZip()),
      name: "todo",
      source: "zip",
      sourceRef: "todo.zip",
      afterStore: analyzeAfterStore({ kind: "zip" }),
    },
    db,
  );
  todosFileId = listFiles(projectId, db).find((f) => f.path === "server/routes/todos.js")!.id;
});
afterEach(() => setDbForTests(undefined));

describe("annotateFile", () => {
  it("stores up to 15 notes on real lines, at the requested depth", async () => {
    const provider = new FakeProvider("api-key", [fixture("annotate-todos.json")]);
    const notes = await annotateFile(projectId, todosFileId, { depth: "beginner" }, db, provider);

    expect(notes).toHaveLength(11); // line 99 does not exist in a 44-line file
    expect(notes.every((n) => n.depth === "beginner")).toBe(true);
    expect(notes.map((n) => n.startLine)).toEqual(
      [...notes.map((n) => n.startLine)].sort((a, b) => a - b),
    );
    const injection = notes.find((n) => n.startLine === 16)!;
    expect(injection.category).toBe("security");
    expect(notes.find((n) => n.startLine === 9)).toMatchObject({ endLine: 10 });
  });

  it("uses the fast model and sends the numbered file", async () => {
    const provider = new FakeProvider("api-key", [fixture("annotate-todos.json")]);
    await annotateFile(projectId, todosFileId, { depth: "advanced" }, db, provider);
    const request = provider.requests[0]!;
    expect(request.model).toBe("claude-haiku-5-5");
    expect(request.context).toContain('<file path="server/routes/todos.js"');
    expect(request.context).toContain("16|     .prepare(`SELECT * FROM todos");
    expect(request.context).toContain("Depth: **advanced**");
  });

  it("serves cached notes without calling the AI again", async () => {
    const provider = new FakeProvider("api-key", [fixture("annotate-todos.json")]);
    await annotateFile(projectId, todosFileId, { depth: "beginner" }, db, provider);
    const again = await annotateFile(projectId, todosFileId, { depth: "beginner" }, db, provider);
    expect(again).toHaveLength(11);
    expect(provider.requests).toHaveLength(1);
  });

  it("keeps a separate set per depth and can regenerate", async () => {
    const provider = new FakeProvider("api-key", [
      fixture("annotate-todos.json"),
      fixture("annotate-todos.json"),
      '{"annotations":[{"line":1,"note":"Fresh note.","category":"concept"}]}',
    ]);
    await annotateFile(projectId, todosFileId, { depth: "beginner" }, db, provider);
    await annotateFile(projectId, todosFileId, { depth: "advanced" }, db, provider);
    const fresh = await annotateFile(
      projectId,
      todosFileId,
      { depth: "beginner", regenerate: true },
      db,
      provider,
    );
    expect(fresh.map((n) => n.note)).toEqual(["Fresh note."]);
    expect(provider.requests).toHaveLength(3);
  });
});
