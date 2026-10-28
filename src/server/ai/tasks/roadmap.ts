import { asc, eq } from "drizzle-orm";
import { type Db, getDb } from "@/db/client";
import { files as filesTable, gitCommits, levels as levelsTable, projects } from "@/db/schema";
import { ProjectAnalysisSchema } from "@/shared/analysis";
import { type RoadmapOutput, RoadmapSchema } from "@/shared/contracts";
import type { Evidence, Layer } from "@/shared/enums";
import { levelsFor, templateTable } from "@/shared/levels";
import { type DraftFile, type DraftLevel, draftRoadmap } from "../../analysis/level-draft";
import { HttpError, notFound } from "../../http";
import { getSettings } from "../../settings";
import { buildTutorRequest, fileBlock } from "../context";
import { runJsonTask } from "../json";
import type { AIProvider } from "../provider";
import { renderPrompt } from "../prompts";
import { getActiveProvider } from "../registry";

// roadmap: file tree + import graph + README + git log -> levels.
// The model proposes; finalizeRoadmap enforces the rules it must not break.

const MAX_LISTED_FILES = 600;
const MAX_LISTED_EDGES = 800;
const MAX_LISTED_COMMITS = 120;

export interface FinalLevel {
  number: number;
  name: string;
  goal: string;
  checkpoint: string;
  whyThisOrder: string;
  evidence: Evidence;
  skipped: boolean;
  files: string[];
}

/**
 * Applies the brief's hard rules to whatever the model returned:
 * never invent files, one level per file, every file placed somewhere,
 * skipped levels have no files, and "git" evidence only when git history exists.
 */
export function finalizeRoadmap(
  output: RoadmapOutput,
  projectFiles: DraftFile[],
  draft: DraftLevel[],
  historyAvailable: boolean,
): { levels: FinalLevel[]; layerFixes: Record<string, Layer> } {
  const known = new Set(projectFiles.map((f) => f.path));
  const placed = new Set<string>();
  const sorted = [...output.levels].sort((a, b) => a.level - b.level);

  const levels: FinalLevel[] = sorted.map((level) => {
    const levelFiles = level.files.filter((p) => known.has(p) && !placed.has(p));
    levelFiles.forEach((p) => placed.add(p));
    return {
      number: level.level,
      name: level.name,
      goal: level.goal,
      checkpoint: level.checkpoint,
      whyThisOrder: level.why_this_order,
      evidence: level.evidence === "git" && !historyAvailable ? "deps" : level.evidence,
      skipped: level.skipped,
      files: levelFiles,
    };
  });

  // Files the model left out keep their draft level (or the closest earlier level it kept).
  for (const draftLevel of draft) {
    for (const filePath of draftLevel.files) {
      if (placed.has(filePath)) continue;
      const target = [...levels].reverse().find((l) => l.number <= draftLevel.level) ?? levels[0];
      if (!target) continue;
      target.files.push(filePath);
      placed.add(filePath);
    }
  }

  levels.forEach((level, index) => {
    level.number = index;
    // A level with files is not skipped; a level without files (other than the idea) is.
    level.skipped = index === 0 ? false : level.files.length === 0;
  });

  const layerFixes: Record<string, Layer> = {};
  for (const [filePath, layer] of Object.entries(output.layers ?? {})) {
    if (known.has(filePath)) layerFixes[filePath] = layer;
  }
  return { levels, layerFixes };
}

function projectData(db: Db, projectId: number, draft: DraftLevel[]): string {
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) throw notFound("Project");
  const analysis = ProjectAnalysisSchema.parse(project.analysis);
  const rows = db
    .select({
      path: filesTable.path,
      layer: filesTable.layer,
      lineCount: filesTable.lineCount,
      content: filesTable.content,
    })
    .from(filesTable)
    .where(eq(filesTable.projectId, projectId))
    .all();

  const order = new Map(analysis.buildOrder.map((p, i) => [p, i]));
  const listed = [...rows].sort((a, b) => (order.get(a.path) ?? 1e9) - (order.get(b.path) ?? 1e9));
  const fileList = listed
    .slice(0, MAX_LISTED_FILES)
    .map((f) => {
      const first = analysis.history.firstSeen[f.path];
      return `- ${f.path} | ${f.layer} | ${f.lineCount} lines${first !== undefined ? ` | first commit #${first}` : ""}`;
    })
    .join("\n");

  const edges = analysis.imports
    .slice(0, MAX_LISTED_EDGES)
    .map((e) => `- ${e.from} -> ${e.to}`)
    .join("\n");

  const commits = db
    .select()
    .from(gitCommits)
    .where(eq(gitCommits.projectId, projectId))
    .orderBy(asc(gitCommits.idx))
    .limit(MAX_LISTED_COMMITS)
    .all()
    .map(
      (c) =>
        `- #${c.idx} ${c.date.toISOString().slice(0, 10)}: ${c.changedPaths.slice(0, 15).join(", ")}`,
    )
    .join("\n");

  const readme = rows.find((f) => /^readme(\.\w+)?$/i.test(f.path));
  const readmeLines = readme ? readme.content.split("\n").slice(0, 200).join("\n") : "";

  return [
    `### Files (${rows.length}${rows.length > MAX_LISTED_FILES ? `, first ${MAX_LISTED_FILES} in dependency order` : ""}) - path | guessed layer | size | first commit`,
    fileList,
    `### Imports (file -> file it uses)`,
    edges || "(none found)",
    `### Git history (oldest first; only changed paths)`,
    analysis.history.available ? commits : "No git history was included.",
    `### Entry points`,
    analysis.entryPoints.join(", ") || "none found",
    `### README`,
    readme ? fileBlock(readme.path, readmeLines) : "No README.",
    `### Draft levels`,
    JSON.stringify(
      draft.map((d) => ({
        level: d.level,
        name: d.name,
        files: d.files,
        evidence: d.evidence,
        skipped: d.skipped,
      })),
    ),
  ].join("\n\n");
}

export function storeRoadmap(
  db: Db,
  projectId: number,
  summary: string,
  result: ReturnType<typeof finalizeRoadmap>,
) {
  db.transaction((tx) => {
    // Regenerating starts the level map over; files are re-linked below.
    tx.delete(levelsTable).where(eq(levelsTable.projectId, projectId)).run();
    const rows = tx
      .select({ id: filesTable.id, path: filesTable.path })
      .from(filesTable)
      .where(eq(filesTable.projectId, projectId))
      .all();
    const idByPath = new Map(rows.map((r) => [r.path, r.id]));

    for (const level of result.levels) {
      const { id } = tx
        .insert(levelsTable)
        .values({
          projectId,
          number: level.number,
          name: level.name,
          goal: level.goal,
          checkpoint: level.checkpoint,
          whyThisOrder: level.whyThisOrder,
          evidence: level.evidence,
          skipped: level.skipped,
        })
        .returning({ id: levelsTable.id })
        .get();
      for (const filePath of level.files) {
        const fileId = idByPath.get(filePath);
        if (fileId)
          tx.update(filesTable).set({ levelId: id }).where(eq(filesTable.id, fileId)).run();
      }
    }
    for (const [filePath, layer] of Object.entries(result.layerFixes)) {
      const fileId = idByPath.get(filePath);
      if (fileId) tx.update(filesTable).set({ layer }).where(eq(filesTable.id, fileId)).run();
    }
    tx.update(projects).set({ summary }).where(eq(projects.id, projectId)).run();
  });
}

export async function generateRoadmap(
  projectId: number,
  db: Db = getDb(),
  provider: AIProvider = getActiveProvider(db),
): Promise<void> {
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) throw notFound("Project");
  const analysis = ProjectAnalysisSchema.safeParse(project.analysis);
  if (!analysis.success)
    throw new HttpError(409, "Analyse the project before building its roadmap.");

  const projectFiles = db
    .select({ path: filesTable.path, layer: filesTable.layer })
    .from(filesTable)
    .where(eq(filesTable.projectId, projectId))
    .all();
  const draft = draftRoadmap(projectFiles, analysis.data);

  const request = buildTutorRequest({
    db,
    projectId,
    task: "roadmap",
    model: getSettings(db).tutorModel,
    instructions: renderPrompt("roadmap", {
      level_template: templateTable(levelsFor(project.profile)),
      project_data: projectData(db, projectId, draft),
    }),
    messages: [{ role: "user", content: "Build the roadmap for this project as JSON." }],
    maxTokens: 8000,
  });

  const output = await runJsonTask({ provider, request, schema: RoadmapSchema });
  const result = finalizeRoadmap(output, projectFiles, draft, analysis.data.history.available);
  storeRoadmap(db, projectId, output.summary, result);
}
