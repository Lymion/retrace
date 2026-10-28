import { eq } from "drizzle-orm";
import { projects } from "@/db/schema";
import type { RepoRef } from "../ingest/github";
import type { IngestInput } from "../ingest/ingest";

export type HistorySource =
  { kind: "zip" } | { kind: "github"; repo: RepoRef & { ref: string }; token: string | undefined };

/** Runs after an upload's files are stored. Phase 3 adds the real analysis. */
export function analyzeAfterStore(_source: HistorySource): NonNullable<IngestInput["afterStore"]> {
  return async (projectId, _prepared, db) => {
    db.update(projects).set({ status: "ready" }).where(eq(projects.id, projectId)).run();
  };
}
