import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/terminal";
import { ProjectAudit } from "@/features/audit/ProjectAudit";
import { AnalysisOverview } from "@/features/explorer/AnalysisOverview";
import { ProjectExplorer } from "@/features/explorer/ProjectExplorer";
import { AlternativesSection, GapsSection } from "@/features/insights/InsightSections";
import { LevelMap, type LevelView } from "@/features/roadmap/LevelMap";
import { ProjectAnalysisSchema } from "@/shared/analysis";
import { parseId } from "@/server/http";
import { getProject, listFiles, listLevels, listRedactions } from "@/server/repo/projects";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const projectId = parseId((await params).id);
  if (!projectId) notFound();

  let project;
  try {
    project = getProject(projectId);
  } catch {
    notFound();
  }
  const files = listFiles(projectId);
  const redactions = listRedactions(projectId);
  const analysis = ProjectAnalysisSchema.safeParse(project.analysis);
  const levels: LevelView[] = listLevels(projectId).map((level) => ({
    id: level.id,
    number: level.number,
    name: level.name,
    goal: level.goal,
    checkpoint: level.checkpoint,
    whyThisOrder: level.whyThisOrder,
    evidence: level.evidence,
    skipped: level.skipped,
    status: level.status,
    files: files.filter((f) => f.levelId === level.id).map((f) => f.path),
  }));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <PageHeader
        path={[{ label: project.name }]}
        title={project.name}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/projects/${projectId}/challenge`} className="btn">
              Remix challenge
            </Link>
            <Link href={`/projects/${projectId}/workspace`} className="btn btn-primary">
              Open workspace
            </Link>
          </div>
        }
      >
        {project.source === "github" ? "From GitHub" : "Uploaded zip"} · {project.sourceRef} ·{" "}
        {files.length} files
      </PageHeader>
      {analysis.success ? (
        <AnalysisOverview analysis={analysis.data} aiSummary={project.summary} />
      ) : (
        <p className="text-sm text-muted">{project.error ?? "This project has no analysis yet."}</p>
      )}
      {analysis.success && <LevelMap projectId={projectId} levels={levels} />}
      {analysis.success && (
        <>
          <ProjectAudit projectId={projectId} />
          <AlternativesSection projectId={projectId} />
          <GapsSection projectId={projectId} />
        </>
      )}
      <ProjectExplorer projectId={projectId} files={files} redactions={redactions} />
    </div>
  );
}
