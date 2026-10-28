import { afterEach, describe, expect, it } from "vitest";
import { setDbForTests } from "@/db/client";
import { fileImports, gitCommits } from "@/db/schema";
import { ProjectAnalysisSchema } from "@/shared/analysis";
import { createTestDb } from "@tests/helpers/db";
import { TODO_HISTORY, buildFlaskZip, buildTodoZip } from "@tests/helpers/sample-zips";
import { writeTempZip } from "@tests/helpers/zips";
import { ingestZip } from "../ingest/ingest";
import { getProject, listFiles } from "../repo/projects";
import { analyzeAfterStore } from "./analyze";

afterEach(() => setDbForTests(undefined));

async function analyseSample(build: () => Promise<Buffer>, name: string) {
  const db = createTestDb();
  const projectId = await ingestZip(
    {
      zipPath: writeTempZip(await build()),
      name,
      source: "zip",
      sourceRef: `${name}.zip`,
      afterStore: analyzeAfterStore({ kind: "zip" }),
    },
    db,
  );
  const project = getProject(projectId, db);
  return { db, projectId, analysis: ProjectAnalysisSchema.parse(project.analysis), project };
}

const edge = (from: string, to: string) => ({ from, to });
const before = (order: string[], a: string, b: string) => order.indexOf(a) < order.indexOf(b);

describe("to-do sample (Express + React, with git history)", () => {
  it("matches the golden analysis", async () => {
    const { analysis } = await analyseSample(buildTodoZip, "todo");
    await expect(JSON.stringify(analysis, null, 2)).toMatchFileSnapshot(
      "__snapshots__/todo-analysis.json",
    );
  });

  it("finds the real imports", async () => {
    const { analysis } = await analyseSample(buildTodoZip, "todo");
    expect(analysis.imports).toEqual(
      expect.arrayContaining([
        edge("server/routes/todos.js", "server/db.js"),
        edge("server/routes/todos.js", "server/middleware/auth.js"),
        edge("server/db.js", "server/schema.sql"),
        edge("server/app.js", "server/routes/auth.js"),
        edge("server/index.js", "server/app.js"),
        edge("client/index.html", "client/src/main.jsx"),
        edge("client/src/pages/Todos.jsx", "client/src/api.js"),
      ]),
    );
    expect(analysis.externalImports).toEqual(
      expect.arrayContaining([
        "express",
        "bcrypt",
        "jsonwebtoken",
        "better-sqlite3",
        "react",
        "vite",
      ]),
    );
  });

  it("orders files so dependencies come first", async () => {
    const { analysis } = await analyseSample(buildTodoZip, "todo");
    const order = analysis.buildOrder;
    expect(order[0]).toBe("README.md");
    expect(before(order, "server/schema.sql", "server/db.js")).toBe(true);
    expect(before(order, "server/db.js", "server/routes/todos.js")).toBe(true);
    expect(before(order, "server/routes/todos.js", "server/app.js")).toBe(true);
    expect(before(order, "server/app.js", "server/index.js")).toBe(true);
    expect(before(order, "client/src/api.js", "client/src/pages/Todos.jsx")).toBe(true);
  });

  it("reads the git history in commit order", async () => {
    const { db, projectId, analysis, project } = await analyseSample(buildTodoZip, "todo");
    expect(project.historySource).toBe("git");
    expect(analysis.history.commitCount).toBe(TODO_HISTORY.length);
    TODO_HISTORY.forEach((commit, idx) => {
      for (const path of commit.paths) expect(analysis.history.firstSeen[path]).toBe(idx);
    });
    // The .env file was never committed, so git has no opinion about it.
    expect(analysis.history.firstSeen[".env"]).toBeUndefined();
    expect(
      db
        .select()
        .from(gitCommits)
        .all()
        .filter((c) => c.projectId === projectId),
    ).toHaveLength(7);
  });

  it("finds entry points and dependencies", async () => {
    const { db, projectId, analysis } = await analyseSample(buildTodoZip, "todo");
    expect(analysis.entryPoints).toEqual(["client/index.html", "server/index.js"]);
    expect(analysis.dependencies.find((d) => d.name === "express")).toMatchObject({
      ecosystem: "npm",
      dev: false,
      manifest: "server/package.json",
    });
    expect(listFiles(projectId, db).find((f) => f.path === "server/index.js")?.isEntry).toBe(true);
    expect(db.select().from(fileImports).all().length).toBeGreaterThan(10);
  });
});

describe("Flask sample (no git history)", () => {
  it("matches the golden analysis", async () => {
    const { analysis } = await analyseSample(buildFlaskZip, "flask");
    await expect(JSON.stringify(analysis, null, 2)).toMatchFileSnapshot(
      "__snapshots__/flask-analysis.json",
    );
  });

  it("builds the Python import graph", async () => {
    const { analysis, project } = await analyseSample(buildFlaskZip, "flask");
    expect(project.historySource).toBe("none");
    expect(analysis.history.available).toBe(false);
    expect(analysis.imports).toEqual(
      expect.arrayContaining([
        edge("app.py", "config.py"),
        edge("app.py", "db.py"),
        edge("app.py", "notes/routes.py"),
        edge("notes/routes.py", "notes/models.py"),
        edge("notes/models.py", "db.py"),
        edge("db.py", "schema.sql"),
        edge("notes/routes.py", "templates/index.html"),
        edge("templates/index.html", "templates/base.html"),
        edge("tests/test_notes.py", "app.py"),
      ]),
    );
    expect(analysis.entryPoints).toEqual(["app.py"]);
    expect(analysis.dependencies.map((d) => d.name)).toEqual(["Flask", "python-dotenv", "pytest"]);
    expect(analysis.layers.test).toBe(1);
  });
});
