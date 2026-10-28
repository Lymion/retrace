import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setDbForTests, type Db } from "@/db/client";
import { PATCH } from "@/app/api/settings/route";
import { createTestDb } from "@tests/helpers/db";
import { FakeProvider, fixture } from "@tests/helpers/fake-provider";
import { buildTodoZip } from "@tests/helpers/sample-zips";
import { writeTempZip } from "@tests/helpers/zips";
import { analyzeAfterStore } from "../analysis/analyze";
import { ingestZip } from "../ingest/ingest";
import { getSettings, updateSettings } from "../settings";
import { getActiveProvider, setProvidersForTests } from "./registry";
import { generateRoadmap } from "./tasks/roadmap";

let db: Db;
let apiKey: FakeProvider;
let login: FakeProvider;

beforeEach(() => {
  db = createTestDb();
  apiKey = new FakeProvider("api-key");
  login = new FakeProvider("claude-login");
  setProvidersForTests({ "api-key": apiKey, "claude-login": login });
});
afterEach(() => {
  setProvidersForTests(undefined);
  setDbForTests(undefined);
});

describe("provider switch", () => {
  it("changes who answers the very next request", async () => {
    const projectId = await ingestZip(
      {
        zipPath: writeTempZip(await buildTodoZip()),
        name: "todo",
        source: "zip",
        sourceRef: "todo.zip",
        afterStore: analyzeAfterStore({ kind: "zip" }),
      },
      db,
    );

    updateSettings({ activeProvider: "api-key" }, db);
    apiKey.queue(fixture("roadmap-todo.json"));
    await generateRoadmap(projectId, db);
    expect(apiKey.requests).toHaveLength(1);
    expect(login.requests).toHaveLength(0);

    // No restart, no re-upload: just the setting.
    updateSettings({ activeProvider: "claude-login" }, db);
    login.queue(fixture("roadmap-todo.json"));
    await generateRoadmap(projectId, db);
    expect(login.requests).toHaveLength(1);
    expect(apiKey.requests).toHaveLength(1);
  });

  it("reads the setting on every call", () => {
    updateSettings({ activeProvider: "claude-login" }, db);
    expect(getActiveProvider(db).id).toBe("claude-login");
    updateSettings({ activeProvider: "api-key" }, db);
    expect(getActiveProvider(db).id).toBe("api-key");
  });

  it("refuses to switch to a provider that is not ready", async () => {
    updateSettings({ activeProvider: "claude-login" }, db);
    apiKey.ready = false;
    const response = await PATCH(
      new Request("http://test/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ activeProvider: "api-key" }),
      }),
    );
    expect(response.status).toBe(409);
    expect(getSettings(db).activeProvider).toBe("claude-login");
  });

  it("switches when the provider is ready", async () => {
    updateSettings({ activeProvider: "claude-login" }, db);
    const response = await PATCH(
      new Request("http://test/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ activeProvider: "api-key" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(getSettings(db).activeProvider).toBe("api-key");
  });

  it("rejects unknown settings", async () => {
    const response = await PATCH(
      new Request("http://test/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ activeProvider: "gpt" }),
      }),
    );
    expect(response.status).toBe(400);
  });
});
