import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { type BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getEnv } from "@/server/env";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

/** Opens a SQLite file (or ":memory:") and brings it up to the latest migration. */
export function openDb(file: string): Db {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  // WAL lets the app read while a long ingest is writing.
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return db;
}

export function dataDir(): string {
  // The ignore comment stops the bundler tracing the whole project because of a
  // runtime path: the data folder holds the learner's database, not code.
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), getEnv().RETRACE_DATA_DIR);
}

// Next.js can load this module more than once in dev (one copy per route
// bundle), so the connection lives on globalThis to keep it to one per process.
const globalForDb = globalThis as typeof globalThis & { __retraceDb?: Db };

export function getDb(): Db {
  globalForDb.__retraceDb ??= openDb(path.join(dataDir(), "retrace.db"));
  return globalForDb.__retraceDb;
}

/** Tests swap in an in-memory database. */
export function setDbForTests(db: Db | undefined): void {
  globalForDb.__retraceDb = db;
}

export function appliedMigrationCount(db: Db): number {
  const row = db.get<{ count: number }>(sql`select count(*) as count from __drizzle_migrations`);
  return row.count;
}
