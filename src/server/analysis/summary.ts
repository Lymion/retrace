import type { ProjectAnalysis } from "@/shared/analysis";

// A plain-text fact sheet about a project, built from the analysis alone.
// The project page shows it, and every tutor prompt starts with it (as the
// cached part), so the tutor always talks about this project, not a generic one.

export function buildFactSheet(
  name: string,
  analysis: ProjectAnalysis,
  aiSummary?: string | null,
): string {
  const lines: string[] = [`# Project: ${name}`];
  if (aiSummary) lines.push("", aiSummary.trim());

  lines.push(
    "",
    `Files: ${analysis.fileCount} (${analysis.totalLines} lines).`,
    `Languages: ${analysis.languages
      .slice(0, 6)
      .map((l) => `${l.name} ${l.files} files`)
      .join(", ")}.`,
    `Layers: ${Object.entries(analysis.layers)
      .filter(([, n]) => n > 0)
      .map(([layer, n]) => `${layer} ${n}`)
      .join(", ")}.`,
    `Entry points: ${analysis.entryPoints.join(", ") || "none found"}.`,
  );

  const runtime = analysis.dependencies.filter((d) => !d.dev).map((d) => d.name);
  const dev = analysis.dependencies.filter((d) => d.dev).map((d) => d.name);
  if (runtime.length) lines.push(`Dependencies: ${runtime.slice(0, 30).join(", ")}.`);
  if (dev.length) lines.push(`Dev dependencies: ${dev.slice(0, 20).join(", ")}.`);

  lines.push(
    analysis.history.available
      ? `Git history: ${analysis.history.commitCount} commits read${analysis.history.truncated ? " (older ones not available)" : ""}.`
      : "Git history: not available.",
  );
  return lines.join("\n");
}
