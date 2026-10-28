// Runs once when the server starts, before it accepts requests.
export async function register() {
  // The edge runtime has no filesystem, and the database is Node-only.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getDb } = await import("./db/client");
  const { log } = await import("./server/logger");
  getDb(); // opening the database applies any pending migrations
  log.info("server.ready", { db: "migrated" });
}
