import { notFound } from "next/navigation";
import { Prompt } from "@/components/terminal";
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
    <div className="flex h-[calc(100dvh-var(--chrome))] min-h-0 flex-col overflow-hidden">
      <div className="border-b border-border px-4 py-2">
        <Prompt
          path={[{ label: project.name, href: `/projects/${project.id}` }, { label: "challenge" }]}
          command="remix"
        />
      </div>
      <ChallengeScreen projectId={project.id} />
    </div>
  );
}
