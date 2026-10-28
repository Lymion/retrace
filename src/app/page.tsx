import { ErrorState } from "@/components/states";
import { Prompt, StatusTag } from "@/components/terminal";
import { ProjectList } from "@/features/upload/ProjectList";
import { UploadPanel } from "@/features/upload/UploadPanel";
import { listProjects } from "@/server/repo/projects";
import { getSettings } from "@/server/settings";

// "Retrace" in figlet's standard font.
const BANNER = String.raw` ____      _
|  _ \ ___| |_ _ __ __ _  ___ ___
| |_) / _ \ __| '__/ _' |/ __/ _ \
|  _ <  __/ |_| | | (_| | (_|  __/
|_| \_\___|\__|_|  \__,_|\___\___|`;

const PROVIDER_LABEL = { "api-key": "your API key", "claude-login": "your Claude login" } as const;

export default function HomePage() {
  let projects: ReturnType<typeof listProjects> | null = null;
  try {
    projects = listProjects();
  } catch {
    projects = null;
  }
  let provider: keyof typeof PROVIDER_LABEL | null = null;
  try {
    provider = getSettings().activeProvider;
  } catch {
    provider = null;
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 p-4 sm:p-6">
      <header className="space-y-4">
        <Prompt command="retrace --start" cursor={false} />
        <pre
          aria-hidden
          className="banner overflow-hidden text-xs leading-tight font-bold sm:text-base"
        >
          {BANNER}
        </pre>
        <h1 className="sr-only">Retrace</h1>
        <p className="max-w-2xl text-sm text-muted">
          <span aria-hidden className="text-comment">
            {"// "}
          </span>
          Upload a project you finished. Retrace works out the order it was built in, then teaches
          it back to you one level at a time, and lets you rebuild each level yourself.
        </p>
        <ul className="space-y-0.5 text-xs" aria-label="Status">
          {projects && (
            <li className="flex">
              <StatusTag tone="ok">ok</StatusTag>
              <span>
                database ready · {projects.length} project{projects.length === 1 ? "" : "s"}
              </span>
            </li>
          )}
          {provider && (
            <li className="flex">
              <StatusTag tone="info">info</StatusTag>
              <span>the tutor answers through {PROVIDER_LABEL[provider]}</span>
            </li>
          )}
          <li className="flex">
            <StatusTag tone="info">tip</StatusTag>
            <span>
              press <kbd className="text-ok">:</kbd> and type <kbd className="text-ok">help</kbd> to
              get around by command
            </span>
          </li>
        </ul>
        <Prompt decorative />
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
