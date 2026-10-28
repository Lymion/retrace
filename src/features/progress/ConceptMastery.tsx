"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EmptyState, ErrorState, Spinner } from "@/components/states";
import { ProviderErrorActions } from "@/features/settings/ProviderErrorActions";
import { errorMessage, postJson } from "@/lib/api-client";

export interface ConceptRow {
  name: string;
  layer: string;
  mastery: number;
  hits: number;
  misses: number;
  note: string | null;
}

function band(mastery: number): { label: string; bar: string } {
  if (mastery >= 0.7) return { label: "solid", bar: "bg-ok" };
  if (mastery >= 0.4) return { label: "getting there", bar: "bg-warn" };
  return { label: "needs work", bar: "bg-danger" };
}

export function ConceptMastery({
  concepts,
  pendingQuestions,
}: {
  concepts: ConceptRow[];
  pendingQuestions: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function updateNow() {
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/profile/update", {});
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(errorMessage(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="concepts-heading" className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="concepts-heading" className="mr-auto text-lg font-semibold">
          Concepts
        </h2>
        {pendingQuestions > 0 && (
          <button type="button" className="btn text-xs" onClick={updateNow} disabled={busy}>
            Learn from my last {pendingQuestions} question{pendingQuestions === 1 ? "" : "s"}
          </button>
        )}
      </div>
      <p className="text-sm text-muted">
        Updated from your rebuild reviews and quiz answers straight away, and from your questions to
        the tutor in batches. The tutor reads this before every explanation.
      </p>
      {busy && <Spinner label="Updating your profile…" />}
      {error && (
        <ErrorState message={error.message}>
          <ProviderErrorActions error={error} onSwitched={updateNow} />
        </ErrorState>
      )}
      {concepts.length === 0 ? (
        <EmptyState title="Nothing measured yet">
          Rebuild a level, take a quiz or chat with the tutor, and your concepts show up here.
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {concepts.map((c) => {
            const { label, bar } = band(c.mastery);
            return (
              <li
                key={c.name}
                className="grid gap-1 sm:grid-cols-[220px_1fr_auto] sm:items-center sm:gap-3"
              >
                <span className="text-sm">
                  {c.name} <span className="text-xs text-muted">· {c.layer}</span>
                </span>
                <div
                  className="term-bar"
                  role="meter"
                  aria-label={`${c.name} mastery`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(c.mastery * 100)}
                  aria-valuetext={`${Math.round(c.mastery * 100)}%, ${label}`}
                >
                  <div
                    className={`h-full ${bar}`}
                    style={{ width: `${Math.round(c.mastery * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-muted">
                  {Math.round(c.mastery * 100)}% · {label}
                </span>
                {c.note && <span className="text-xs text-muted sm:col-span-3">{c.note}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
