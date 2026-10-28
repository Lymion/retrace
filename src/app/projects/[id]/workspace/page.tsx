import { notFound } from "next/navigation";
import type { LevelView } from "@/features/roadmap/LevelMap";
import { Workspace } from "@/features/workspace/Workspace";
import { MODES, type Mode } from "@/features/workspace/types";
import { parseId } from "@/server/http";
import { getProject, listFiles, listLevels } from "@/server/repo/projects";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Workspace · Retrace" };

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const projectId = parseId((await params).id);
  if (!projectId) notFound();
  let project;
  try {
    project = getProject(projectId);
  } catch {
    notFound();
  }

  const query = await searchParams;
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const files = listFiles(projectId);
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

  const levelId = parseId(one(query.level));
  // ?path= opens a file by its path (links from the project page), ?line= jumps to a line.
  const byPath = one(query.path);
  const fileId = parseId(one(query.file)) ?? files.find((f) => f.path === byPath)?.id ?? null;
  const line = parseId(one(query.line));
  const mode = MODES.find((m) => m === one(query.mode)) ?? ("tour" as Mode);

  return (
    <Workspace
      project={{ id: project.id, name: project.name }}
      levels={levels}
      files={files.map((f) => ({
        id: f.id,
        path: f.path,
        language: f.language,
        levelId: f.levelId,
        lineCount: f.lineCount,
      }))}
      depth={getSettings().depth}
      initial={{
        levelId: levels.some((l) => l.id === levelId) ? levelId : null,
        fileId: files.some((f) => f.id === fileId) ? fileId : null,
        mode,
        line,
      }}
    />
  );
}
