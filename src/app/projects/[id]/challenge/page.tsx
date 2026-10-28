import Link from "next/link";
import { notFound } from "next/navigation";
import { ChallengeScreen } from "@/features/remix/ChallengeScreen";
import { parseId } from "@/server/http";
import { getProject } from "@/server/repo/projects";

export const metadata = { title: "Remix challenge · Retrace" };

export default async function ChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const projectId = parseId((await params).id);
  if (!projectId) notFound();
  let project;
  try {
    project = getProject(projectId);
  } catch {
    notFound();
  }

  return (
    <div className="flex h-[calc(100dvh-3rem)] min-h-0 flex-col overflow-hidden">
      <nav aria-label="Breadcrumb" className="border-b border-border px-4 py-2 text-sm text-muted">
        <Link href={`/projects/${project.id}`} className="hover:text-text">
          {project.name}
        </Link>{" "}
        / <span className="text-text">Remix challenge</span>
      </nav>
      <ChallengeScreen projectId={project.id} />
    </div>
  );
}
