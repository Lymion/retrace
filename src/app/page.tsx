import { ErrorState } from "@/components/states";
import { ProjectList } from "@/features/upload/ProjectList";
import { UploadPanel } from "@/features/upload/UploadPanel";
import { listProjects } from "@/server/repo/projects";

export default function HomePage() {
  let projects: ReturnType<typeof listProjects> | null = null;
  try {
    projects = listProjects();
  } catch {
    projects = null;
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Retrace</h1>
        <p className="mt-1 text-muted">
          Upload a project you finished. Retrace works out the order it was built in, then teaches
          it back to you one level at a time, and lets you rebuild each level yourself.
        </p>
      </header>
      <UploadPanel />
      {projects ? (
        <ProjectList
          projects={projects.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() }))}
        />
      ) : (
        <ErrorState message="Could not read the project list from the database." />
      )}
    </div>
  );
}
