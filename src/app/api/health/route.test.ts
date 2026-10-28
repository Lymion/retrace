import { afterEach, describe, expect, it } from "vitest";
import { setDbForTests } from "@/db/client";
import { createTestDb } from "@tests/helpers/db";
import { GET } from "./route";

afterEach(() => setDbForTests(undefined));

describe("GET /api/health", () => {
  it("reports ok once migrations have run", async () => {
    createTestDb();
    const response = await GET();
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; migrations: number };
    expect(body.ok).toBe(true);
    expect(body.migrations).toBeGreaterThanOrEqual(1);
  });
});
