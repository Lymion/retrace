import { existsSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { setDbForTests } from "@/db/client";
import { files, redactions } from "@/db/schema";
import { createTestDb } from "@tests/helpers/db";
import { buildFlaskZip, buildTodoZip } from "@tests/helpers/sample-zips";
import { makeZip, writeTempZip } from "@tests/helpers/zips";
import { analyzeAfterStore } from "../analysis/analyze";
import { getProject, listFiles, listRedactions } from "../repo/projects";
import { ingestZip } from "./ingest";
import { ExtractError } from "./safe-extract";

afterEach(() => setDbForTests(undefined));

// Values planted in the samples' .env files and source.
const PLANTED_SECRETS = [
  "sample-only-9f8e7d6c5b4a3f2e1d0c",
  "super-secret-dev-key-123",
  "sample-flask-key-4b7e1c9a2d",
];

async function ingestSample(build: () => Promise<Buffer>, name: string) {
  const db = createTestDb();
  const zipPath = writeTempZip(await build());
  const projectId = await ingestZip(
    {
      zipPath,
      name,
      source: "zip",
      sourceRef: `${name}.zip`,
      afterStore: analyzeAfterStore({ kind: "zip" }),
    },
    db,
  );
  return { db, projectId, zipPath };
}

describe("ingestZip", () => {
  it("stores the to-do sample's files with layers and languages", async () => {
    const { db, projectId, zipPath } = await ingestSample(buildTodoZip, "todo");
    const stored = listFiles(projectId, db);
    const paths = stored.map((f) => f.path);

    expect(paths).toContain("server/routes/todos.js");
    expect(paths).toContain("client/src/pages/Login.jsx");
    expect(paths.some((p) => p.startsWith(".git/"))).toBe(false);
    expect(paths).toContain(".gitignore");
    expect(stored.find((f) => f.path === "server/db.js")).toMatchObject({
      layer: "database",
      language: "javascript",
    });
    expect(getProject(projectId, db).status).toBe("ready");
    // The uploaded zip is deleted once extraction finishes.
    expect(existsSync(zipPath)).toBe(false);
  });

  it("never lets a planted secret reach the database", async () => {
    for (const [build, name] of [
      [buildTodoZip, "todo"],
      [buildFlaskZip, "flask"],
    ] as const) {
      const { db } = await ingestSample(build, name);
      const everything = JSON.stringify([
        db.select().from(files).all(),
        db.select().from(redactions).all(),
      ]);
      for (const secret of PLANTED_SECRETS) expect(everything).not.toContain(secret);
    }
  });

  it("lists what was redacted, with file and line", async () => {
    const { db, projectId } = await ingestSample(buildTodoZip, "todo");
    const list = listRedactions(projectId, db);
    expect(list).toContainEqual(
      expect.objectContaining({
        path: "server/middleware/auth.js",
        line: 3,
        kind: "hard-coded secret",
      }),
    );
    expect(list.filter((r) => r.path === ".env")).toHaveLength(3);
  });

  it("stores nothing when the zip is hostile", async () => {
    const db = createTestDb();
    const zipPath = writeTempZip(makeZip([{ name: "ok.js" }, { name: "../../evil.js" }]));
    await expect(
      ingestZip({ zipPath, name: "bad", source: "zip", sourceRef: "bad.zip" }, db),
    ).rejects.toBeInstanceOf(ExtractError);
    expect(db.select().from(files).all()).toHaveLength(0);
    expect(existsSync(zipPath)).toBe(false);
  });
});
