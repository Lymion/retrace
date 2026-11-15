import { and, eq, max } from "drizzle-orm";
import { type Db, getDb } from "@/db/client";
import { files, levels, messages, projects } from "@/db/schema";
import { ProjectAnalysisSchema } from "@/shared/analysis";
import { listProjects } from "./projects";

// What the home screen shows: each project with its levels, main languages
// and when it was last used, newest activity first.

export interface HomeLevel {
  id: number;
  number: number;
  name: string;
  status: string;
  skipped: boolean;
  /** Lines of code in the level, for the token estimate. */
  lines: number;
  /** A lesson is already saved, so touring it again costs nothing. */
  hasLesson: boolean;
}

export interface HomeProject {
  id: number;
  name: string;
  status: "ingesting" | "ready" | "failed";
  source: "zip" | "github";
  sourceRef: string;
  fileCount: number;
  languages: string[];
  levels: HomeLevel[];
  lastActive: string;
}

export function homeProjects(db: Db = getDb()): HomeProject[] {
  const lessonLevels = new Set(
    db
      .select({ levelId: messages.levelId })
      .from(messages)
      .where(eq(messages.kind, "lesson"))
      .all()
      .map((r) => r.levelId),
  );
  const lastMessage = new Map(
    db
      .select({ projectId: messages.projectId, at: max(messages.createdAt) })
      .from(messages)
      .groupBy(messages.projectId)
      .all()
      .map((r) => [r.projectId, r.at] as const),
  );

  return listProjects(db)
    .map((p) => {
      const project = db
        .select({ analysis: projects.analysis })
        .from(projects)
        .where(eq(projects.id, p.id))
        .get();
      const analysis = ProjectAnalysisSchema.safeParse(project?.analysis);
      const levelRows = db
        .select()
        .from(levels)
        .where(eq(levels.projectId, p.id))
        .orderBy(levels.number)
        .all();
      const fileRows = db
        .select({ levelId: files.levelId, lineCount: files.lineCount })
        .from(files)
        .where(and(eq(files.projectId, p.id)))
        .all();
      const at = lastMessage.get(p.id);
      const last = at ? new Date(at as unknown as number) : p.createdAt;
      return {
        id: p.id,
        name: p.name,
        status: p.status,
        source: p.source,
        sourceRef: p.sourceRef,
        fileCount: p.fileCount ?? 0,
        languages: analysis.success
          ? [...analysis.data.languages]
              .sort((a, b) => b.lines - a.lines)
              .slice(0, 3)
              .map((l) => l.name.toLowerCase())
          : [],
        levels: levelRows.map((l) => ({
          id: l.id,
          number: l.number,
          name: l.name,
          status: l.status,
          skipped: l.skipped,
          lines: fileRows.filter((f) => f.levelId === l.id).reduce((n, f) => n + f.lineCount, 0),
          hasLesson: lessonLevels.has(l.id),
        })),
        lastActive: (last > p.createdAt ? last : p.createdAt).toISOString(),
      };
    })
    .sort((a, b) => b.lastActive.localeCompare(a.lastActive));
}

/** The level to pick up next: the first one not done and not skipped. */
export function nextLevel(levelsOf: HomeLevel[]): HomeLevel | null {
  return levelsOf.find((l) => !l.skipped && l.status !== "done") ?? null;
}
