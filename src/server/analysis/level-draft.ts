import path from "node:path";
import type { ProjectAnalysis } from "@/shared/analysis";
import type { Evidence, Layer } from "@/shared/enums";
import { WEB_LEVELS } from "@/shared/levels";

// A first roadmap built without AI: each file goes to a template level by
// its layer and name. It gives the model a concrete starting point, and it
// is the fallback for any file the model leaves out.

export interface DraftFile {
  path: string;
  layer: Layer;
}

export interface DraftLevel {
  level: number;
  name: string;
  goal: string;
  files: string[];
  checkpoint: string;
  why_this_order: string;
  evidence: Evidence;
  skipped: boolean;
}

/** The template level a file most likely belongs to. */
export function templateLevelFor(file: DraftFile): number {
  const lower = file.path.toLowerCase();
  const name = path.posix.basename(lower);

  if (/^readme/.test(name) || lower.startsWith("docs/") || /^(license|changelog)/.test(name))
    return 0;
  if (
    lower.startsWith(".github/") ||
    /^(dockerfile.*|docker-compose.*|procfile|vercel\.json|netlify\.toml|fly\.toml|render\.yaml|\.gitlab-ci\.yml)$/.test(
      name,
    )
  ) {
    return 12;
  }
  if (file.layer === "test") return 9;
  if (file.layer === "config") return 1;
  if (file.layer === "database") {
    return /\.(sql|prisma)$/.test(name) ||
      /(^|\/)(models?|schemas?|migrations?)\//.test(lower) ||
      /^(schema|models?)\./.test(name)
      ? 2
      : 3;
  }
  if (file.layer === "security") return /(rate|helmet|cors|csrf|sanitiz)/.test(lower) ? 10 : 4;
  if (/(validat|error|exception)/.test(name)) return 8;
  if (file.layer === "frontend") {
    if (
      /(^|\/)(api|services?|client|fetch|http)\.(j|t)sx?$/.test(lower) ||
      /(^|\/)(services|api)\//.test(lower)
    )
      return 6;
    return 5;
  }
  if (file.layer === "backend") return 3;
  return 0;
}

export function draftRoadmap(files: DraftFile[], analysis: ProjectAnalysis): DraftLevel[] {
  const byLevel = new Map<number, string[]>();
  // Keep the dependency order inside each level, so files read in build order.
  const position = new Map(analysis.buildOrder.map((p, i) => [p, i]));
  const ordered = [...files].sort(
    (a, b) => (position.get(a.path) ?? 1e9) - (position.get(b.path) ?? 1e9),
  );
  for (const file of ordered) {
    const level = templateLevelFor(file);
    byLevel.set(level, [...(byLevel.get(level) ?? []), file.path]);
  }

  const edgesFrom = new Map<string, string[]>();
  for (const edge of analysis.imports)
    edgesFrom.set(edge.from, [...(edgesFrom.get(edge.from) ?? []), edge.to]);
  const seen = new Set<string>();

  return WEB_LEVELS.map((template) => {
    const levelFiles = byLevel.get(template.number) ?? [];
    const inHistory = levelFiles.some((p) => p in analysis.history.firstSeen);
    const usesEarlier = levelFiles.some((p) => (edgesFrom.get(p) ?? []).some((to) => seen.has(to)));
    levelFiles.forEach((p) => seen.add(p));
    const skipped = template.number !== 0 && levelFiles.length === 0;
    return {
      level: template.number,
      name: template.name,
      goal: template.builds,
      files: levelFiles,
      checkpoint: template.checkpoint,
      why_this_order: skipped
        ? "This project has no files for this level, so it is taught as a missing level."
        : "Placed by the level template from each file's layer and name.",
      evidence: analysis.history.available && inHistory ? "git" : usesEarlier ? "deps" : "template",
      skipped,
    };
  });
}
