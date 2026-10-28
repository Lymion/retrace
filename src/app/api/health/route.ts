import { appliedMigrationCount, getDb } from "@/db/client";
import { errorFields, log } from "@/server/logger";

export async function GET() {
  try {
    const migrations = appliedMigrationCount(getDb());
    return Response.json({ ok: true, db: "ok", migrations });
  } catch (error) {
    log.error("health.failed", errorFields(error));
    return Response.json({ ok: false, db: "error" }, { status: 500 });
  }
}
