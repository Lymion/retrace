import { type Db, openDb, setDbForTests } from "@/db/client";

/** A fresh, fully migrated in-memory database installed as the app's database. */
export function createTestDb(): Db {
  const db = openDb(":memory:");
  setDbForTests(db);
  return db;
}
