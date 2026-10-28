import { afterEach, describe, expect, it } from "vitest";
import { setDbForTests } from "@/db/client";
import { createTestDb } from "@tests/helpers/db";
import { FakeProvider, fixture } from "@tests/helpers/fake-provider";
import { buildFlaskZip } from "@tests/helpers/sample-zips";
import { writeTempZip } from "@tests/helpers/zips";
import { analyzeAfterStore } from "../../analysis/analyze";
import { ingestZip } from "../../ingest/ingest";
import { listFiles, listLevels } from "../../repo/projects";
import { generateRoadmap } from "./roadmap";

afterEach(() => setDbForTests(undefined));

// The second sample: Python, no git history, and a project that has tests
// (so its testing level is not skipped) but no accounts.
describe("roadmap for the Flask sample", () => {
  it("places every file, marks skipped levels, and never claims git evidence", async () => {
    const db = createTestDb();
    const projectId = await ingestZip(
      {
        zipPath: writeTempZip(await buildFlaskZip()),
        name: "flask-notes",
        source: "zip",
        sourceRef: "flask-notes.zip",
        afterStore: analyzeAfterStore({ kind: "zip" }),
      },
      db,
    );
    await generateRoadmap(
      projectId,
      db,
      new FakeProvider("api-key", [fixture("roadmap-flask.json")]),
    );

    const levels = listLevels(projectId, db);
    expect(levels.map((l) => l.name)).toEqual([
      "Idea and scope",
      "Project setup",
      "Data design",
      "Backend core",
      "Auth and sessions",
      "Pages and routes",
      "Testing",
      "Ship and maintain",
    ]);
    expect(levels.filter((l) => l.skipped).map((l) => l.name)).toEqual([
      "Auth and sessions",
      "Ship and maintain",
    ]);
    expect(levels.find((l) => l.name === "Testing")?.skipped).toBe(false);
    // The fixture says "git" for two levels, but this upload has no history.
    expect(levels.every((l) => l.evidence !== "git")).toBe(true);
    expect(listFiles(projectId, db).every((f) => f.levelId !== null)).toBe(true);
  });
});
