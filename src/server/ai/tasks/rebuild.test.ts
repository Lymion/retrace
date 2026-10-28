import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setDbForTests, type Db } from "@/db/client";
import { learningEvents, levels } from "@/db/schema";
import { createTestDb } from "@tests/helpers/db";
import { FakeProvider, fixture } from "@tests/helpers/fake-provider";
import { buildTodoZip } from "@tests/helpers/sample-zips";
import { writeTempZip } from "@tests/helpers/zips";
import { analyzeAfterStore } from "../../analysis/analyze";
import { HttpError } from "../../http";
import { ingestZip } from "../../ingest/ingest";
import { getFileContent, listFiles, listLevels } from "../../repo/projects";
import { AIError } from "../provider";
import { generateRoadmap } from "./roadmap";
import {
  SubmittedFilesSchema,
  createRebuildSpec,
  quotedOriginalLine,
  reviewRebuild,
  saveDraft,
} from "./rebuild";

let db: Db;
let projectId: number;
let levelId: number;

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
  await generateRoadmap(projectId, db, new FakeProvider("api-key", [fixture("roadmap-todo.json")]));
  levelId = listLevels(projectId, db).find((l) => l.name === "Backend core")!.id;
});
afterEach(() => setDbForTests(undefined));

const LEARNER_FILES = [
  {
    path: "server/db.js",
    content:
      "const Database = require('better-sqlite3');\nmodule.exports = new Database('todos.db');",
  },
  { path: "server/routes/todos.js", content: "// my routes\n" },
];

describe("quotedOriginalLine", () => {
  const original =
    'const todos = db.prepare("SELECT * FROM todos WHERE user_id = ?").all(req.userId);\nres.json(todos);';

  it("finds a copied line, ignoring spacing", () => {
    const spec =
      'Write: const todos  = db.prepare("SELECT * FROM todos WHERE user_id = ?").all(req.userId);';
    expect(quotedOriginalLine(spec, [original])).toMatch(/^const todos = db.prepare/);
  });

  it("ignores short generic lines and plain descriptions", () => {
    expect(
      quotedOriginalLine("Answer with res.json(todos); after the query.", [original]),
    ).toBeNull();
    expect(
      quotedOriginalLine("List the user's todos with a parameterised query.", [original]),
    ).toBeNull();
  });
});

describe("createRebuildSpec", () => {
  it("stores a spec with three checks and an empty file per path", async () => {
    const provider = new FakeProvider("api-key", [fixture("rebuild-spec-level3.json")]);
    const attempt = await createRebuildSpec(projectId, levelId, db, provider);
    expect(attempt.status).toBe("spec");
    expect(attempt.spec.acceptance_checks.map((c) => c.id)).toEqual(["A1", "A2", "A3"]);
    expect(attempt.files.map((f) => f.path)).toEqual([
      "server/db.js",
      "server/routes/todos.js",
      "server/app.js",
      "server/index.js",
    ]);
    expect(attempt.files.every((f) => f.content === "")).toBe(true);

    // The model sees the originals (to describe them) and earlier levels (as outlines only).
    const context = provider.requests[0]!.context ?? "";
    expect(context).toContain('<file path="server/routes/todos.js"');
    expect(context).toContain("- server/schema.sql (level 2)");
    expect(context).not.toContain('<file path="client/');
  });

  it("never keeps a spec that quotes the original code", async () => {
    const leaky = JSON.parse(fixture("rebuild-spec-level3.json")) as { summary: string };
    const todos = getFileContent(
      projectId,
      listFiles(projectId, db).find((f) => f.path === "server/routes/todos.js")!.id,
      db,
    );
    leaky.summary = `Copy this: ${todos.content.split("\n")[8]!.trim()}`;
    const provider = new FakeProvider("api-key", [
      JSON.stringify(leaky),
      fixture("rebuild-spec-level3.json"),
    ]);

    const attempt = await createRebuildSpec(projectId, levelId, db, provider);
    expect(provider.requests).toHaveLength(2);
    expect(provider.requests[1]!.messages.at(-1)!.content).toMatch(/quotes the original code/);
    expect(JSON.stringify(attempt.spec)).not.toContain(
      'SELECT * FROM todos WHERE user_id = ?").all',
    );

    const stubborn = new FakeProvider("api-key", [JSON.stringify(leaky), JSON.stringify(leaky)]);
    await expect(createRebuildSpec(projectId, levelId, db, stubborn)).rejects.toBeInstanceOf(
      AIError,
    );
  });
});

describe("drafts and review", () => {
  it("rejects file paths that escape the project", () => {
    for (const path of ["../evil.js", "/etc/passwd", "C:/x.js"]) {
      expect(SubmittedFilesSchema.safeParse([{ path, content: "" }]).success).toBe(false);
    }
  });

  it("saves a draft", async () => {
    const attempt = await createRebuildSpec(
      projectId,
      levelId,
      db,
      new FakeProvider("api-key", [fixture("rebuild-spec-level3.json")]),
    );
    const saved = saveDraft(projectId, attempt.id, LEARNER_FILES, db);
    expect(saved.files).toEqual(LEARNER_FILES);
  });

  it("reviews against the original and cites only real original files", async () => {
    const attempt = await createRebuildSpec(
      projectId,
      levelId,
      db,
      new FakeProvider("api-key", [fixture("rebuild-spec-level3.json")]),
    );
    const provider = new FakeProvider("claude-login", [fixture("rebuild-review-level3.json")]);
    const reviewed = await reviewRebuild(projectId, attempt.id, LEARNER_FILES, db, provider);

    expect(reviewed.status).toBe("reviewed");
    const review = reviewed.review!;
    expect(review.verdicts.map((v) => v.passed)).toEqual([true, false, true]);
    expect(review.verdicts[0]!.original).toEqual({ file: "server/app.js", line: 11 });
    expect(review.verdicts[1]!.original).toEqual({ file: "server/routes/todos.js", line: 16 });
    expect(review.verdicts[2]!.original).toBeNull(); // made-up file dropped
    expect(review.bugs[0]!.file).toBe("server/routes/todos.js");
    expect(review.approach_differences[0]!.original_ref).toEqual({
      file: "server/routes/todos.js",
      line: 8,
    });

    const context = provider.requests[0]!.context ?? "";
    expect(context).toContain('<file path="learner/server/db.js"');
    expect(context).toContain('<file path="original/server/db.js"');
    expect(context).toContain("Different is not wrong");

    expect(db.select().from(levels).where(eq(levels.id, levelId)).get()?.status).toBe("rebuilt");
    const event = db.select().from(learningEvents).all().at(-1)!;
    expect(event.kind).toBe("rebuild_review");
    expect(JSON.stringify(event.detail)).toContain("parameterised queries");
    expect(JSON.stringify(event.detail)).not.toContain("require('better-sqlite3')"); // summaries, not code
  });

  it("refuses to review an empty attempt", async () => {
    const attempt = await createRebuildSpec(
      projectId,
      levelId,
      db,
      new FakeProvider("api-key", [fixture("rebuild-spec-level3.json")]),
    );
    await expect(
      reviewRebuild(
        projectId,
        attempt.id,
        [{ path: "server/db.js", content: "  " }],
        db,
        new FakeProvider(),
      ),
    ).rejects.toBeInstanceOf(HttpError);
  });
});
