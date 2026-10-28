"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorState, Spinner } from "@/components/states";
import { ApiError, errorMessage, postJson } from "@/lib/api-client";
import { ProviderErrorActions } from "@/features/settings/ProviderErrorActions";

export interface LevelView {
  id: number;
  number: number;
  name: string;
  goal: string;
  checkpoint: string;
  whyThisOrder: string;
  evidence: "git" | "deps" | "template";
  skipped: boolean;
  status: "not_started" | "touring" | "rebuilt" | "done";
  files: string[];
}

const EVIDENCE_LABEL: Record<LevelView["evidence"], { text: string; title: string }> = {
  git: { text: "git history", title: "Placed using the project's commit order" },
  deps: { text: "imports", title: "Placed using which files import which" },
  template: { text: "template", title: "Placed using the standard level template" },
};

const STATUS_LABEL: Record<LevelView["status"], string> = {
  not_started: "Not started",
  touring: "In tour",
  rebuilt: "Rebuilt",
  done: "Done",
};

export function LevelMap({ projectId, levels }: { projectId: number; levels: LevelView[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | Error | null>(null);

  async function build() {
    if (
      levels.length > 0 &&
      !window.confirm("Rebuild the roadmap? Level progress and rebuild attempts are reset.")
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await postJson(`/api/projects/${projectId}/roadmap`, {});
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(errorMessage(err)));
    } finally {
      setBusy(false);
    }
  }

  const taught = levels.filter((l) => !l.skipped);
  const done = taught.filter((l) => l.status === "done").length;

  return (
    <section aria-labelledby="levels-heading" className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h2 id="levels-heading" className="text-lg font-semibold">
            Level map
          </h2>
          <p className="text-sm text-muted">
            The order this project was most likely built in, from the idea to shipping.
          </p>
        </div>
        <button
          type="button"
          className={levels.length ? "btn" : "btn btn-primary"}
          onClick={build}
          disabled={busy}
        >
          {levels.length ? "Rebuild roadmap" : "Build the roadmap"}
        </button>
      </div>

      <div aria-live="polite">
        {busy && (
          <Spinner label="The tutor is reading the project and working out its build order…" />
        )}
        {error && (
          <ErrorState message={error.message}>
            <ProviderErrorActions error={error} onSwitched={build} />
          </ErrorState>
        )}
      </div>

      {levels.length === 0 && !busy && (
        <div className="card p-5 text-sm text-muted">
          No roadmap yet. Building it sends the file list, the import graph, the README and the git
          history (paths and dates only) to the tutor. Secrets were already removed.
        </div>
      )}

      {levels.length > 0 && (
        <>
          <div>
            <div className="flex justify-between text-xs text-muted">
              <span>
                {done} of {taught.length} levels done
              </span>
              <span>{levels.length - taught.length} skipped by this project</span>
            </div>
            <div
              className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2"
              role="progressbar"
              aria-label="Levels completed"
              aria-valuemin={0}
              aria-valuemax={taught.length}
              aria-valuenow={done}
            >
              <div
                className="h-full bg-ok"
                style={{ width: `${taught.length ? (done / taught.length) * 100 : 0}%` }}
              />
            </div>
          </div>

          <ol className="space-y-3">
            {levels.map((level) => (
              <li
                key={level.id}
                className={`card p-4 ${level.skipped ? "border-dashed bg-transparent" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    aria-hidden
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                      level.status === "done" ? "bg-ok text-bg" : "bg-surface-2"
                    }`}
                  >
                    {level.number}
                  </span>
                  <h3 className="font-semibold">
                    <span className="sr-only">Level {level.number}: </span>
                    {level.name}
                  </h3>
                  {level.skipped ? (
                    <span className="chip border-warn/60 text-warn">Skipped in this project</span>
                  ) : (
                    <span className="chip">{STATUS_LABEL[level.status]}</span>
                  )}
                  <span className="chip" title={EVIDENCE_LABEL[level.evidence].title}>
                    from {EVIDENCE_LABEL[level.evidence].text}
                  </span>
                  <Link
                    href={`/projects/${projectId}/workspace?level=${level.id}`}
                    className="btn btn-ghost ml-auto text-accent"
                  >
                    {level.skipped ? "Learn this missing level" : "Open in workspace"} →
                  </Link>
                </div>
                <p className="mt-2 text-sm">{level.goal}</p>
                <p className="mt-2 text-sm">
                  <span className="font-medium text-ok">Checkpoint:</span> {level.checkpoint}
                </p>
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-muted">
                    Why this order{level.files.length ? ` · ${level.files.length} files` : ""}
                  </summary>
                  <p className="mt-1">{level.whyThisOrder}</p>
                  {level.files.length > 0 && (
                    <ul className="mt-2 grid gap-0.5 font-mono text-xs text-muted sm:grid-cols-2">
                      {level.files.map((f) => (
                        <li key={f} className="truncate" title={f}>
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}
                </details>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
