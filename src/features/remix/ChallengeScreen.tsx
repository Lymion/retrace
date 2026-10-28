"use client";

import { useEffect, useState } from "react";
import { CodeViewer } from "@/components/CodeViewer";
import { EmptyState, ErrorState, LoadingState, Spinner } from "@/components/states";
import { ProviderErrorActions } from "@/features/settings/ProviderErrorActions";
import { apiFetch, errorMessage, postJson } from "@/lib/api-client";
import { useFetch } from "@/lib/use-fetch";
import { detectLanguage } from "@/server/ingest/language";
import type { RemixReview } from "@/shared/contracts";

// A remix challenge: the spec and hints on the left, the starter files to
// fill in, and the review. Hints come one at a time; there is no solution.

interface Challenge {
  id: number;
  title: string;
  spec: {
    title: string;
    domain: string;
    summary: string;
    inputs: string[];
    outputs: string[];
    acceptance_checks: { id: string; description: string; how_to_verify: string }[];
    patterns_reused: string[];
    files_needed: { path: string; purpose: string }[];
  };
  skeleton: { path: string; content: string }[];
  attempt: { path: string; content: string }[] | null;
  hints: string[];
  hintsUsed: number;
  hintsTotal: number;
  status: "open" | "submitted" | "reviewed";
  review: RemixReview | null;
}

export function ChallengeScreen({ projectId }: { projectId: number }) {
  const latest = useFetch<{ challenge: Challenge | null }>(`/api/projects/${projectId}/challenge`);
  const [local, setLocal] = useState<Challenge | null>(null);
  const challenge = local ?? latest.data?.challenge ?? null;
  const [drafts, setDrafts] = useState<{
    id: number;
    files: { path: string; content: string }[];
  } | null>(null);
  const files = challenge
    ? drafts?.id === challenge.id
      ? drafts.files
      : (challenge.attempt ?? challenge.skeleton)
    : [];
  const [activePath, setActivePath] = useState<string | null>(null);
  const active = files.find((f) => f.path === activePath) ?? files[0] ?? null;
  const [busy, setBusy] = useState<"new" | "hint" | "review" | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const reviewed = challenge?.status === "reviewed";

  useEffect(() => {
    if (!drafts || reviewed) return;
    const timer = window.setTimeout(() => {
      void apiFetch(`/api/projects/${projectId}/challenge/${drafts.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: drafts.files }),
      }).catch(() => undefined);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [drafts, projectId, reviewed]);

  async function act(
    kind: "new" | "hint" | "review",
    task: () => Promise<{ challenge: Challenge }>,
  ) {
    setBusy(kind);
    setError(null);
    try {
      const { challenge: next } = await task();
      setLocal(next);
      if (kind !== "hint") setDrafts(null);
      if (kind === "new") setActivePath(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(errorMessage(err)));
    } finally {
      setBusy(null);
    }
  }

  const newChallenge = () => {
    if (challenge && !window.confirm("Start a new challenge? This one stays saved.")) return;
    void act("new", () => postJson(`/api/projects/${projectId}/challenge`, {}));
  };

  const errorBox = error && (
    <ErrorState message={error.message}>
      <ProviderErrorActions error={error} />
    </ErrorState>
  );

  if (latest.loading) return <LoadingState label="Loading your challenge…" />;
  if (latest.error) return <ErrorState message={latest.error} onRetry={latest.reload} />;

  if (!challenge) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <EmptyState title="No challenge yet">
          A remix challenge is a different feature in a new domain that reuses this project&apos;s
          patterns. You get a spec, starter files with TODOs and three hints, but no solution.
        </EmptyState>
        <button
          type="button"
          className="btn btn-primary"
          onClick={newChallenge}
          disabled={busy !== null}
        >
          Create a challenge
        </button>
        {busy === "new" && <Spinner label="Designing a challenge from your project's patterns…" />}
        {errorBox}
      </div>
    );
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)_360px] lg:grid-rows-[minmax(0,1fr)]">
      <aside
        aria-label="Challenge"
        className="min-h-0 space-y-4 overflow-auto border-r border-border bg-surface p-4 text-sm"
      >
        <div>
          <p className="text-xs text-muted uppercase">Remix · {challenge.spec.domain}</p>
          <h2 className="text-base font-semibold">{challenge.title}</h2>
          <p className="mt-1">{challenge.spec.summary}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {challenge.spec.patterns_reused.map((p) => (
            <span key={p} className="chip">
              {p}
            </span>
          ))}
        </div>
        <div>
          <h3 className="text-xs font-semibold text-muted uppercase">Acceptance checks</h3>
          <ol className="mt-1 space-y-2">
            {challenge.spec.acceptance_checks.map((c) => (
              <li key={c.id} className="rounded border border-border p-2">
                <span className="font-mono text-xs text-accent">{c.id}</span> {c.description}
                <span className="block text-xs text-muted">How to check: {c.how_to_verify}</span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h3 className="text-xs font-semibold text-muted uppercase">
            Hints ({challenge.hintsUsed} of {challenge.hintsTotal})
          </h3>
          <ol className="mt-1 list-decimal space-y-1 pl-4">
            {challenge.hints.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ol>
          {challenge.hintsUsed < challenge.hintsTotal && !reviewed && (
            <button
              type="button"
              className="btn mt-2 text-xs"
              disabled={busy !== null}
              onClick={() =>
                act("hint", () =>
                  postJson(`/api/projects/${projectId}/challenge/${challenge.id}`, {
                    action: "hint",
                  }),
                )
              }
            >
              Show hint {challenge.hintsUsed + 1}
            </button>
          )}
        </div>
        <button
          type="button"
          className="btn text-xs"
          onClick={newChallenge}
          disabled={busy !== null}
        >
          New challenge
        </button>
      </aside>

      <section aria-label="Your files" className="flex min-h-0 min-w-0 flex-col">
        <div
          role="tablist"
          aria-label="Files"
          className="flex gap-1 overflow-x-auto border-b border-border px-2 py-1"
        >
          {files.map((f) => (
            <button
              key={f.path}
              type="button"
              role="tab"
              aria-selected={active?.path === f.path}
              onClick={() => setActivePath(f.path)}
              className={`rounded px-2 py-1 font-mono text-xs ${active?.path === f.path ? "bg-surface-2" : "text-muted hover:text-text"}`}
            >
              {f.path}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1">
          {active && (
            <CodeViewer
              key={`${challenge.id}:${active.path}`}
              path={`challenge/${challenge.id}/${active.path}`}
              language={detectLanguage(active.path)}
              content={active.content}
              readOnly={reviewed}
              onChange={(value) =>
                setDrafts({
                  id: challenge.id,
                  files: files.map((f) => (f.path === active.path ? { ...f, content: value } : f)),
                })
              }
            />
          )}
        </div>
        {!reviewed && (
          <div className="flex justify-end border-t border-border px-3 py-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy !== null}
              onClick={() =>
                act("review", () =>
                  postJson(`/api/projects/${projectId}/challenge/${challenge.id}`, {
                    action: "review",
                    files,
                  }),
                )
              }
            >
              Submit for review
            </button>
          </div>
        )}
      </section>

      <aside
        aria-label="Review"
        className="min-h-0 space-y-3 overflow-auto border-l border-border bg-surface p-4 text-sm"
      >
        {busy === "review" && <Spinner label="Reviewing your attempt…" />}
        {errorBox}
        {challenge.review ? (
          <>
            <h2 className="text-base font-semibold">
              Review · {challenge.review.verdicts.filter((v) => v.passed).length} of 3 checks passed
            </h2>
            <p>{challenge.review.summary}</p>
            <ul className="space-y-2">
              {challenge.review.verdicts.map((v) => (
                <li key={v.check_id} className="rounded border border-border p-2">
                  <span className={v.passed ? "text-ok" : "text-danger"}>
                    {v.passed ? "✓" : "✗"}
                  </span>{" "}
                  <span className="font-mono text-xs">{v.check_id}</span> {v.explanation}
                </li>
              ))}
            </ul>
          </>
        ) : (
          busy !== "review" && (
            <p className="text-muted">Fill in the TODOs, then submit to get a review here.</p>
          )
        )}
      </aside>
    </div>
  );
}
