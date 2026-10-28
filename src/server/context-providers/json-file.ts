import { readFileSync, statSync } from "node:fs";
import { z } from "zod";
import type { ContextProvider, ContextRequest } from "./types";

// A stub provider: reads outside context from a JSON file that another tool
// (for example the learner's screen-annotation tool) writes. It shows the
// shape real providers will have. Enable it with RETRACE_CONTEXT_FILE in .env.
//
// File format:
// { "notes": [ { "text": "...", "projectId": 3, "filePath": "server/db.js" } ] }
// projectId and filePath are optional; a note without them applies everywhere.

const MAX_FILE_BYTES = 64 * 1024;

const NotesFileSchema = z.object({
  notes: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(2000),
        projectId: z.number().int().positive().optional(),
        filePath: z.string().max(300).optional(),
      }),
    )
    .max(50),
});

export function createJsonFileContextProvider(
  filePath: string,
  resolveFilePath: (fileId: number) => string | null = () => null,
): ContextProvider {
  return {
    id: "json-file",
    label: "Notes file",
    provide(request: ContextRequest) {
      let raw: string;
      try {
        if (statSync(filePath).size > MAX_FILE_BYTES) return null;
        raw = readFileSync(filePath, "utf8");
      } catch {
        return null; // no file yet: nothing to add
      }
      let parsed;
      try {
        parsed = NotesFileSchema.safeParse(JSON.parse(raw));
      } catch {
        return null;
      }
      if (!parsed.success) return null;

      const openPath = request.fileId ? resolveFilePath(request.fileId) : null;
      const notes = parsed.data.notes.filter(
        (n) =>
          (n.projectId === undefined || n.projectId === request.projectId) &&
          (n.filePath === undefined || n.filePath === openPath),
      );
      return notes.length ? notes.map((n) => `- ${n.text}`).join("\n") : null;
    },
  };
}
