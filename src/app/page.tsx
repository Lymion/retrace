import Link from "next/link";
import { ErrorState } from "@/components/states";
import { Pane, PromptLine } from "@/components/terminal";
import { ProjectList } from "@/features/upload/ProjectList";
import { UploadPanel } from "@/features/upload/UploadPanel";
import { estimateLessonTokens, formatTokens } from "@/lib/tokens";
import { type HomeLevel, type HomeProject, homeProjects, nextLevel } from "@/server/repo/home";

// The block-letter logo. Decoration only: the page heading is "Retrace".
const LOGO = `██████╗ ███████╗████████╗██████╗  █████╗  ██████╗███████╗
██╔══██╗██╔════╝╚══██╔══╝██╔══██╗██╔══██╗██╔════╝██╔════╝
██████╔╝█████╗     ██║   ██████╔╝███████║██║     █████╗
██╔══██╗██╔══╝     ██║   ██╔══██╗██╔══██║██║     ██╔══╝
██║  ██║███████╗   ██║   ██║  ██║██║  ██║╚██████╗███████╗
╚═╝  ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚══════╝`;

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** 0 ━━ 1 ━━ ● 2 ┄┄ 3: done levels solid, the current one marked, the rest dotted. */
function Trail({ levels, current }: { levels: HomeLevel[]; current: HomeLevel | null }) {
  return (
    <p aria-hidden className="mt-2 mb-1.5 truncate text-xs">
      {levels.map((level, i) => {
        const isCurrent = level.id === current?.id;
        const done = level.status === "done";
        const join = i === 0 ? "" : done || isCurrent ? " ━━ " : " ┄┄ ";
        return (
          <span key={level.id}>
            <span className={done ? "text-ok" : "text-comment"}>{join}</span>
            <span
              className={
                isCurrent
                  ? "text-number"
                  : done
                    ? "text-ok"
                    : level.skipped
                      ? "text-comment line-through"
                      : "text-comment"
              }
            >
              {isCurrent ? `● ${level.number}` : level.number}
            </span>
          </span>
        );
      })}
    </p>
  );
}

function Resume({ project }: { project: HomeProject }) {
  const level = nextLevel(project.levels);
  const counted = project.levels.filter((l) => !l.skipped);
  const done = counted.filter((l) => l.status === "done").length;
  const share = counted.length ? Math.round((done / counted.length) * 100) : 0;
  const href = level
    ? `/projects/${project.id}/workspace?level=${level.id}&mode=tour`
    : project.levels.length
      ? `/projects/${project.id}/workspace`
      : `/projects/${project.id}`;
  const action = !project.levels.length
    ? "build the roadmap"
    : !level
      ? "review the project"
      : level.hasLesson || level.status !== "not_started"
        ? "continue the tour"
        : "start the tour";
  const cost = !level
    ? null
    : level.hasLesson
      ? "lesson saved · 0 tokens"
      : `about ${formatTokens(estimateLessonTokens(level.lines))} tokens for the lesson`;

  return (
    <Pane title="resume" note={`last opened ${ago(project.lastActive)}`} role="number" on>
      <div className="space-y-3">
        <p className="text-[17px] leading-snug font-semibold text-balance text-bright">
          {project.name}
          {level && (
            <>
              <span className="text-comment"> · </span>level {level.number}
              <span className="text-comment"> · </span>
              {level.name}
            </>
          )}
        </p>
        {counted.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div
              className="term-bar min-w-[200px] flex-1"
              role="img"
              aria-label={`${done} of ${counted.length} levels done`}
            >
              <div className="bar-fill" style={{ width: `${share}%` }} />
            </div>
            <span className="text-muted">
              {done}/{counted.length} levels
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link href={href} className="btn btn-primary">
            {action}
          </Link>
          {cost && <span className="text-xs text-comment">{cost}</span>}
        </div>
      </div>
    </Pane>
  );
}

export default function HomePage() {
  let projects: HomeProject[] | null = null;
  try {
    projects = homeProjects();
  } catch {
    projects = null;
  }
  const recent = projects?.find((p) => p.status === "ready") ?? null;
  const current = recent ? nextLevel(recent.levels) : null;

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-7 px-4 py-6 sm:px-6">
      <header>
        <PromptLine command="retrace" flags="--start" />
        <pre aria-hidden className="banner gradient-text mt-2.5">
          {LOGO}
        </pre>
        <h1 className="sr-only">Retrace</h1>
        {recent && recent.levels.length > 0 && <Trail levels={recent.levels} current={current} />}
        <p className="mt-1 text-xs text-comment">
          <span aria-hidden>{"// "}</span>
          rebuild what you already built, one level at a time
        </p>
      </header>

      {projects === null && (
        <ErrorState message="Could not read the project list from the database." />
      )}
      {recent && <Resume project={recent} />}
      {projects && projects.length > 0 && <ProjectList projects={projects} />}
      <UploadPanel focal={!projects || projects.length === 0} />
    </div>
  );
}
