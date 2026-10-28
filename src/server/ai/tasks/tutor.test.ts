import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as chatPOST } from "@/app/api/chat/route";
import { setDbForTests, type Db } from "@/db/client";
import { levels, messages } from "@/db/schema";
import { createTestDb } from "@tests/helpers/db";
import { FakeProvider, fixture } from "@tests/helpers/fake-provider";
import { buildTodoZip } from "@tests/helpers/sample-zips";
import { writeTempZip } from "@tests/helpers/zips";
import { analyzeAfterStore } from "../../analysis/analyze";
import { clearContextProviders, registerContextProvider } from "../../context-providers/registry";
import { ingestZip } from "../../ingest/ingest";
import { resetRateLimitForTests } from "../../rate-limit";
import { listFiles, listLevels } from "../../repo/projects";
import { updateSettings } from "../../settings";
import { AIError } from "../provider";
import { setProvidersForTests } from "../registry";
import { generateRoadmap } from "./roadmap";
import { prepareChat, prepareLesson } from "./tutor";

let db: Db;
let projectId: number;

beforeEach(async () => {
  db = createTestDb();
  resetRateLimitForTests();
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
  await generateRoadmap(projectId, db, new FakeProvider("api-key", [fixture("roadmap-todo.json")]));
});
afterEach(() => {
  setDbForTests(undefined);
  setProvidersForTests(undefined);
  clearContextProviders();
});

const levelNamed = (name: string) => listLevels(projectId, db).find((l) => l.name === name)!;
const fileNamed = (path: string) => listFiles(projectId, db).find((f) => f.path === path)!;

describe("chat", () => {
  it("knows the level, the open file and the selection, and saves both turns", async () => {
    const provider = new FakeProvider("claude-login", ["L16 pastes q into the SQL."]);
    const level = levelNamed("Backend core");
    const file = fileNamed("server/routes/todos.js");
    const task = prepareChat(
      {
        projectId,
        levelId: level.id,
        fileId: file.id,
        message: "Kenapa line 16 bahaya?",
        selection: { startLine: 16, endLine: 16 },
      },
      db,
      provider,
    );

    expect(task.request.task).toBe("explain_selection");
    expect(task.request.model).toBe("claude-sonnet-5-5");
    expect(task.request.context).toContain("## Current level: 3. Backend core");
    expect(task.request.context).toContain('<file path="server/routes/todos.js"');
    expect(task.request.context).toContain("selected lines 16-16");
    expect(task.request.context).toContain("## Learner profile");
    expect(task.request.messages.at(-1)).toEqual({
      role: "user",
      content: "Kenapa line 16 bahaya?",
    });

    task.save("L16 pastes q into the SQL.");
    const rows = db.select().from(messages).where(eq(messages.projectId, projectId)).all();
    expect(rows.map((r) => [r.role, r.provider])).toEqual([
      ["user", null],
      ["assistant", "claude-login"],
    ]);
  });

  it("includes only the last 10 messages as history", () => {
    for (let i = 0; i < 12; i++) {
      db.insert(messages)
        .values({
          projectId,
          role: i % 2 ? "assistant" : "user",
          content: `old ${i}`,
          createdAt: new Date(1000 + i),
        })
        .run();
    }
    const task = prepareChat({ projectId, message: "new question" }, db, new FakeProvider());
    expect(task.request.messages).toHaveLength(11);
    expect(task.request.messages[0]!.content).toBe("old 2");
  });

  it("adds outside context from registered providers as untrusted data", () => {
    registerContextProvider({
      id: "fake",
      label: "Fake tool",
      provide: () => "Haykal circled line 16 on screen.",
    });
    const task = prepareChat({ projectId, message: "hi" }, db, new FakeProvider());
    expect(task.request.context).toContain('<outside_context source="fake">');
    expect(task.request.context).toContain("Haykal circled line 16 on screen.");
  });

  it("streams through the API and stores the reply with its provider", async () => {
    const login = new FakeProvider("claude-login", ["Because q goes into the SQL text."]);
    setProvidersForTests({ "claude-login": login, "api-key": new FakeProvider("api-key") });
    updateSettings({ activeProvider: "claude-login" }, db);

    const response = await chatPOST(
      new Request("http://test/api/chat", {
        method: "POST",
        body: JSON.stringify({ projectId, message: "Why?" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("Because q goes into the SQL text.");
    const assistant = db
      .select()
      .from(messages)
      .all()
      .find((m) => m.role === "assistant");
    expect(assistant).toMatchObject({
      content: "Because q goes into the SQL text.",
      provider: "claude-login",
    });
  });

  it("answers a provider that is not ready with a JSON error naming it", async () => {
    const broken = new FakeProvider("claude-login");
    broken.complete = async () => {
      throw new AIError("not_ready", "Sign in again.", "claude-login");
    };
    setProvidersForTests({ "claude-login": broken });
    updateSettings({ activeProvider: "claude-login" }, db);
    const response = await chatPOST(
      new Request("http://test/api/chat", {
        method: "POST",
        body: JSON.stringify({ projectId, message: "Why?" }),
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { message: "Sign in again.", code: "ai_not_ready", provider: "claude-login" },
    });
  });

  it("rejects empty and oversized messages", async () => {
    for (const message of ["   ", "x".repeat(4001)]) {
      const response = await chatPOST(
        new Request("http://test/api/chat", {
          method: "POST",
          body: JSON.stringify({ projectId, message }),
        }),
      );
      expect(response.status).toBe(400);
    }
  });
});

describe("teach_level", () => {
  it("sends the level's files, asks for the six parts and marks the level as touring", async () => {
    const provider = new FakeProvider("api-key", [fixture("lesson-level3.md")]);
    const level = levelNamed("Backend core");
    const task = prepareLesson(projectId, level.id, db, provider);

    expect(task.request.task).toBe("teach_level");
    for (const heading of [
      "## 1. What we build",
      "## 2. The files",
      "## 3. One alternative",
      "## 4. One security",
      "## 5. The checkpoint",
      "## 6. Your turn",
    ]) {
      expect(task.request.context).toContain(heading);
    }
    for (const path of [
      "server/db.js",
      "server/routes/todos.js",
      "server/app.js",
      "server/index.js",
    ]) {
      expect(task.request.context).toContain(`<file path="${path}"`);
    }
    expect(task.request.context).not.toContain('<file path="client/src/App.jsx"');
    expect(db.select().from(levels).where(eq(levels.id, level.id)).get()?.status).toBe("touring");

    const lesson = fixture("lesson-level3.md");
    task.save(lesson);
    const saved = db.select().from(messages).all().at(-1)!;
    expect(saved).toMatchObject({ kind: "lesson", levelId: level.id, role: "assistant" });
    expect(saved.content).toMatch(/\?\s*$/); // ends with a check-for-understanding question
  });

  it("teaches a skipped level as a missing level", () => {
    const testing = levelNamed("Testing");
    const task = prepareLesson(projectId, testing.id, db, new FakeProvider());
    expect(task.request.context).toContain("SKIPPED this level");
    expect(task.request.context).toContain("(This level has no files in the project.)");
  });
});
