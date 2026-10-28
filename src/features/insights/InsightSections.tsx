"use client";

import { useState } from "react";
import { EmptyState, ErrorState, LoadingState, Spinner } from "@/components/states";
import { ProviderErrorActions } from "@/features/settings/ProviderErrorActions";
import { errorMessage, postJson } from "@/lib/api-client";
import { useFetch } from "@/lib/use-fetch";

// Project-level insights: design decisions with alternatives, and lessons
// and gaps (which also feed the reusable checklist on the Progress page).

function useGenerated<T>(getUrl: string) {
  const fetched = useFetch<T>(getUrl);
  const [fresh, setFresh] = useState<T | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  async function generate() {
    setBusy(true);
    setError(null);
    try {
      setFresh(await postJson<T>(getUrl, {}));
    } catch (err) {
      setError(err instanceof Error ? err : new Error(errorMessage(err)));
    } finally {
      setBusy(false);
    }
  }
  return {
    data: fresh ?? fetched.data,
    loading: fetched.loading,
    loadError: fetched.error,
    reload: fetched.reload,
    busy,
    error,
    generate,
  };
}

interface Option {
  name: string;
  pros: string[];
  cons: string[];
  pickWhen: string;
  chosen: boolean;
}

export function AlternativesSection({ projectId }: { projectId: number }) {
  const state = useGenerated<{ decisions: { id: number; decision: string; options: Option[] }[] }>(
    `/api/projects/${projectId}/alternatives`,
  );
  const decisions = state.data?.decisions ?? [];

  return (
    <section aria-labelledby="alternatives-heading" className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="alternatives-heading" className="mr-auto text-lg font-semibold">
          Design decisions and alternatives
        </h2>
        <button type="button" className="btn" onClick={state.generate} disabled={state.busy}>
          {decisions.length ? "Write again" : "Explain the decisions"}
        </button>
      </div>
      {state.loading && <LoadingState />}
      {state.loadError && <ErrorState message={state.loadError} onRetry={state.reload} />}
      {state.busy && <Spinner label="Weighing the choices this project made…" />}
      {state.error && (
        <ErrorState message={state.error.message}>
          <ProviderErrorActions error={state.error} onSwitched={state.generate} />
        </ErrorState>
      )}
      {!state.loading && decisions.length === 0 && !state.busy && (
        <EmptyState title="Not written yet">
          For each big choice (database, auth, state...): what this project chose, two alternatives,
          and when to pick each.
        </EmptyState>
      )}
      {decisions.map((d) => (
        <div key={d.id}>
          <h3 className="font-medium">{d.decision}</h3>
          <div className="mt-2 grid gap-3 md:grid-cols-3">
            {d.options.map((o) => (
              <div
                key={o.name}
                className={`rounded border p-3 text-sm ${o.chosen ? "border-accent" : "border-border"}`}
              >
                <p className="font-medium">
                  {o.name} {o.chosen && <span className="chip ml-1 text-accent">chosen</span>}
                </p>
                <ul className="mt-2 space-y-0.5">
                  {o.pros.map((p) => (
                    <li key={p}>
                      <span className="text-ok">+</span> {p}
                    </li>
                  ))}
                  {o.cons.map((c) => (
                    <li key={c}>
                      <span className="text-danger">−</span> {c}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted">Pick when: {o.pickWhen}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

interface GapsReport {
  lessons: { title: string; why_it_matters: string }[];
  missing: { practice: string; why_it_matters: string; evidence: string }[];
  checklist: { title: string }[];
}

export function GapsSection({ projectId }: { projectId: number }) {
  const state = useGenerated<{ report: GapsReport | null }>(`/api/projects/${projectId}/gaps`);
  const report = state.data?.report ?? null;

  return (
    <section aria-labelledby="gaps-heading" className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="gaps-heading" className="mr-auto text-lg font-semibold">
          Lessons and gaps
        </h2>
        <button type="button" className="btn" onClick={state.generate} disabled={state.busy}>
          {report ? "Write again" : "Find lessons and gaps"}
        </button>
      </div>
      {state.loading && <LoadingState />}
      {state.loadError && <ErrorState message={state.loadError} onRetry={state.reload} />}
      {state.busy && (
        <Spinner label="Looking at what this project teaches and what it is missing…" />
      )}
      {state.error && (
        <ErrorState message={state.error.message}>
          <ProviderErrorActions error={state.error} onSwitched={state.generate} />
        </ErrorState>
      )}
      {!state.loading && !report && !state.busy && (
        <EmptyState title="Not written yet">
          What this code teaches well, what it is missing (tests, validation, logging, CI/CD...),
          and new items for your reusable checklist.
        </EmptyState>
      )}
      {report && (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="font-medium text-ok">What this code teaches</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {report.lessons.map((l) => (
                <li key={l.title}>
                  <strong>{l.title}.</strong> <span className="text-muted">{l.why_it_matters}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-medium text-warn">What is missing</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {report.missing.map((m) => (
                <li key={m.practice}>
                  <strong>{m.practice}.</strong> {m.why_it_matters}{" "}
                  <span className="block text-xs text-muted">Evidence: {m.evidence}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-sm text-muted md:col-span-2">
            {report.checklist.length} items went into your reusable checklist on the{" "}
            <a href="/progress" className="text-accent underline">
              Progress
            </a>{" "}
            page.
          </p>
        </div>
      )}
    </section>
  );
}
