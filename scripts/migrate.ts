// Applies migrations without starting the app. The server also does this on
// boot (src/instrumentation.ts), so this is mainly for a fresh clone.
import { appliedMigrationCount, getDb } from "../src/db/client";

const db = getDb();
console.log(`Database ready: ${appliedMigrationCount(db)} migration(s) applied.`);
