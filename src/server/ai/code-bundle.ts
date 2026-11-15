import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { files } from "@/db/schema";
import type { Layer } from "@/shared/enums";
import { fileBlock, outline } from "./context";

// Packs a project's (or a level's) code into one prompt section within a
// line budget. The files most likely to matter for security and design go
// in whole; the rest are sent as outlines (declarations only).

const LAYER_PRIORITY: Layer[] = [
  "security",
  "backend",
  "database",
  "config",
  "frontend",
  "other",
  "test",
];

export interface BundleOptions {
  projectId: number;
  levelId?: number | null;
  maxLines?: number;
  /**
   * When set, only files in these layers may be sent in full; the rest are
   * outlined. The project-wide audit uses it to spend its budget on the code
   * where security problems live.
   */
  fullLayers?: Layer[];
}

export interface CodeBundle {
  text: string;
  paths: Set<string>;
  lineCounts: Map<string, number>;
}

export function codeBundle(
  db: Db,
  { projectId, levelId, maxLines = 2500, fullLayers }: BundleOptions,
): CodeBundle {
  const rows = db
    .select()
    .from(files)
    .where(
      levelId
        ? and(eq(files.projectId, projectId), eq(files.levelId, levelId))
        : eq(files.projectId, projectId),
    )
    .orderBy(asc(files.path))
    .all()
    .sort((a, b) => LAYER_PRIORITY.indexOf(a.layer) - LAYER_PRIORITY.indexOf(b.layer));

  let used = 0;
  const parts: string[] = [];
  for (const file of rows) {
    const mayBeFull = !fullLayers || fullLayers.includes(file.layer);
    if (mayBeFull && used + file.lineCount <= maxLines) {
      used += file.lineCount;
      parts.push(fileBlock(file.path, file.content));
    } else {
      const lines = outline(file.content, 12);
      parts.push(
        `Outline of ${file.path} (${file.lineCount} lines, not sent in full):\n${lines.join("\n") || "(no declarations)"}`,
      );
    }
  }
  return {
    text: parts.join("\n\n") || "(no files)",
    paths: new Set(rows.map((r) => r.path)),
    lineCounts: new Map(rows.map((r) => [r.path, r.lineCount])),
  };
}
