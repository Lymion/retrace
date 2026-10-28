import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectExplorer } from "@/features/explorer/ProjectExplorer";
import { parseId } from "@/server/http";
import { getProject, listFiles, listRedactions } from "@/server/repo/projects";

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

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/" className="hover:text-text">
          Projects
        </Link>{" "}
        / <span className="text-text">{project.name}</span>
      </nav>
      <header>
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {project.source === "github" ? "From GitHub" : "Uploaded zip"} · {project.sourceRef} ·{" "}
          {files.length} files
        </p>
      </header>
      <ProjectExplorer projectId={projectId} files={files} redactions={redactions} />
    </div>
  );
}
