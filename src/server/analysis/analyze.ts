import { rmSync } from "node:fs";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { fileImports, files as filesTable, gitCommits, projects } from "@/db/schema";
import { type ProjectAnalysis, ProjectAnalysisSchema } from "@/shared/analysis";
import { LAYERS, type Layer } from "@/shared/enums";
import { errorFields, log } from "../logger";
import type { RepoRef } from "../ingest/github";
import type { IngestInput, PreparedProject } from "../ingest/ingest";
import { languageLabel } from "../ingest/language";
import { readDependencies } from "./deps";
import { detectEntryPoints } from "./entry-points";
import { type GitHistory, cloneGithubHistory, firstSeen, readGitHistory } from "./git-history";
import { buildImportGraph } from "./import-graph";
import { buildOrder } from "./topo";

// Analysis = everything we can learn about a project without AI. It is the
// evidence the roadmap is built from, in the brief's order: git history
// first, then the import graph, then the phase template.

export type HistorySource =
  { kind: "zip" } | { kind: "github"; repo: RepoRef & { ref: string }; token: string | undefined };

/** Lower ranks are written earlier when nothing else decides the order. */
const LAYER_RANK: Record<Layer, number> = {
  other: 0,
  config: 1,
  database: 2,
  backend: 3,
  security: 4,
  frontend: 5,
  test: 6,
};

function rankOf(filePath: string, layer: Layer): number {
  // The README is the idea, Level 0, so it always comes first.
  if (/^readme(\.\w+)?$/i.test(filePath)) return -1;
  // Docs and other loose files go last, not with the README.
  return layer === "other" ? 7 : LAYER_RANK[layer];
}

export interface AnalysisResult {
  analysis: ProjectAnalysis;
  edges: { from: string; to: string; specifier: string }[];
  externalEdges: { from: string; name: string }[];
}

/** Pure: same files and history in, same analysis out. */
export function computeAnalysis(
  prepared: PreparedProject,
  history: GitHistory | null,
): AnalysisResult {
  const files = prepared.files;
  const layerByPath = new Map(files.map((f) => [f.path, f.layer]));
  const graph = buildImportGraph(files);
  const order = buildOrder(
    files.map((f) => f.path),
    graph.edges,
    (p) => rankOf(p, layerByPath.get(p) ?? "other"),
  );

  const languages = new Map<string, { files: number; lines: number }>();
  for (const file of files) {
    const label = languageLabel(file.language);
    const stat = languages.get(label) ?? { files: 0, lines: 0 };
    stat.files++;
    stat.lines += file.lineCount;
    languages.set(label, stat);
  }

  const layers = Object.fromEntries(LAYERS.map((l) => [l, 0])) as Record<Layer, number>;
  for (const file of files) layers[file.layer]++;

  const keep = new Set(files.map((f) => f.path));
  const analysis: ProjectAnalysis = {
    fileCount: files.length,
    totalLines: files.reduce((sum, f) => sum + f.lineCount, 0),
    languages: [...languages.entries()]
      .map(([name, stat]) => ({ name, ...stat }))
      .sort((a, b) => b.lines - a.lines || a.name.localeCompare(b.name)),
    layers,
    entryPoints: detectEntryPoints(files),
    dependencies: readDependencies(files),
    imports: graph.edges.map(({ from, to }) => ({ from, to })),
    externalImports: [...new Set(graph.external.map((e) => e.name))].sort(),
    buildOrder: order,
    history: {
      available: Boolean(history && history.commits.length > 0),
      commitCount: history?.commits.length ?? 0,
      truncated: history?.truncated ?? false,
      firstSeen: history ? firstSeen(history, keep) : {},
    },
    skipped: Object.entries(prepared.skipped)
      .map(([reason, count]) => ({ reason, count: count ?? 0 }))
      .sort((a, b) => b.count - a.count),
    redactionCount: files.reduce((sum, f) => sum + f.redactions.length, 0),
  };

  return {
    analysis: ProjectAnalysisSchema.parse(analysis),
    edges: graph.edges,
    externalEdges: graph.external,
  };
}

async function loadHistory(
  source: HistorySource,
  prepared: PreparedProject,
): Promise<GitHistory | null> {
  try {
    if (source.kind === "zip")
      return prepared.gitDir ? await readGitHistory(prepared.gitDir) : null;
    const { newTempPath } = await import("../ingest/ingest");
    const dir = newTempPath();
    try {
      return await cloneGithubHistory(source.repo, source.token, dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  } catch (error) {
    // History is a bonus. Without it the roadmap falls back to imports.
    log.warn("history.unavailable", errorFields(error));
    return null;
  }
}

function storeAnalysis(
  db: Db,
  projectId: number,
  result: AnalysisResult,
  history: GitHistory | null,
) {
  db.transaction((tx) => {
    const rows = tx
      .select({ id: filesTable.id, path: filesTable.path })
      .from(filesTable)
      .where(eq(filesTable.projectId, projectId))
      .all();
    const idByPath = new Map(rows.map((r) => [r.path, r.id]));

    for (const edge of result.edges) {
      const fromFileId = idByPath.get(edge.from);
      const toFileId = idByPath.get(edge.to);
      if (fromFileId && toFileId) {
        tx.insert(fileImports)
          .values({ projectId, fromFileId, toFileId, specifier: edge.specifier })
          .run();
      }
    }
    for (const edge of result.externalEdges) {
      const fromFileId = idByPath.get(edge.from);
      if (fromFileId)
        tx.insert(fileImports)
          .values({ projectId, fromFileId, toFileId: null, specifier: edge.name })
          .run();
    }
    for (const entry of result.analysis.entryPoints) {
      const id = idByPath.get(entry);
      if (id) tx.update(filesTable).set({ isEntry: true }).where(eq(filesTable.id, id)).run();
    }
    for (const commit of history?.commits ?? []) {
      tx.insert(gitCommits)
        .values({
          projectId,
          idx: commit.idx,
          date: commit.date,
          changedPaths: commit.changedPaths,
        })
        .run();
    }
    tx.update(projects)
      .set({
        analysis: result.analysis,
        historySource: result.analysis.history.available ? "git" : "none",
        status: "ready",
      })
      .where(eq(projects.id, projectId))
      .run();
  });
}

/** Plugged into ingestZip: runs once the files are stored. */
export function analyzeAfterStore(source: HistorySource): NonNullable<IngestInput["afterStore"]> {
  return async (projectId, prepared, db) => {
    const history = await loadHistory(source, prepared);
    try {
      storeAnalysis(db, projectId, computeAnalysis(prepared, history), history);
    } catch (error) {
      // Keep the files: the learner can still browse them and re-run analysis later.
      log.error("analysis.failed", { projectId, ...errorFields(error) });
      db.update(projects)
        .set({ status: "ready", error: "The project was saved, but its analysis failed." })
        .where(eq(projects.id, projectId))
        .run();
    }
  };
}
