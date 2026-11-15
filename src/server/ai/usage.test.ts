import { afterEach, describe, expect, it, vi } from "vitest";
import { setDbForTests } from "@/db/client";
import { aiUsage } from "@/db/schema";
import { createTestDb } from "@tests/helpers/db";
import { log } from "../logger";
import { cachedPercent, recordUsage, toReport, usageSummary } from "./usage";

afterEach(() => {
  setDbForTests(undefined);
  vi.restoreAllMocks();
});

const base = { task: "chat", provider: "api-key", model: "claude-sonnet-5-5" } as const;

describe("toReport", () => {
  it("maps the API's field names and treats missing counts as 0", () => {
    expect(
      toReport(base, {
        input_tokens: 120,
        output_tokens: 40,
        cache_read_input_tokens: 3000,
        cache_creation_input_tokens: null,
      }),
    ).toEqual({
      ...base,
      inputTokens: 120,
      outputTokens: 40,
      cacheReadTokens: 3000,
      cacheWriteTokens: 0,
    });
    expect(toReport(base, undefined)).toMatchObject({ inputTokens: 0, outputTokens: 0 });
  });
});

describe("recordUsage and usageSummary", () => {
  it("stores only counts and sums them for today, the week and per task", () => {
    const db = createTestDb();
    const now = new Date();
    recordUsage(
      toReport(base, { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 900 }),
      db,
    );
    recordUsage(toReport(base, { input_tokens: 10, output_tokens: 5 }), db);
    recordUsage(
      toReport({ ...base, task: "roadmap" }, { input_tokens: 4000, output_tokens: 2000 }),
      db,
    );
    // Eight days ago: outside the week.
    db.insert(aiUsage)
      .values({
        ...toReport(base, { input_tokens: 99_999 }),
        createdAt: new Date(now.getTime() - 8 * 86_400_000),
      })
      .run();

    const columns = Object.keys(db.select().from(aiUsage).get()!);
    expect(columns.sort()).toEqual(
      [
        "cacheReadTokens",
        "cacheWriteTokens",
        "createdAt",
        "id",
        "inputTokens",
        "model",
        "outputTokens",
        "provider",
        "task",
      ].sort(),
    );

    const summary = usageSummary(db, now);
    expect(summary.today).toEqual({
      calls: 3,
      inputTokens: 4110,
      outputTokens: 2055,
      cacheReadTokens: 900,
      cacheWriteTokens: 0,
    });
    expect(summary.week.calls).toBe(3);
    expect(summary.byTask.map((t) => [t.task, t.calls])).toEqual([
      ["roadmap", 1],
      ["chat", 2],
    ]);
  });

  it("never breaks the answer when saving fails", () => {
    const warn = vi.spyOn(log, "warn").mockImplementation(() => {});
    const broken = {
      insert: () => {
        throw new Error("disk full");
      },
    } as unknown as Parameters<typeof recordUsage>[1];
    expect(() => recordUsage(toReport(base, { input_tokens: 1 }), broken)).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      "ai.usage_not_saved",
      expect.objectContaining({ task: "chat" }),
    );
  });

  it("works out the cached share of input", () => {
    expect(
      cachedPercent({
        calls: 1,
        inputTokens: 100,
        outputTokens: 0,
        cacheReadTokens: 300,
        cacheWriteTokens: 0,
      }),
    ).toBe(75);
    expect(
      cachedPercent({
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      }),
    ).toBe(0);
  });
});
