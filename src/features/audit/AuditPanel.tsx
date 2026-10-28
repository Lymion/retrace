"use client";

import { useState } from "react";
import { EmptyState, ErrorState, LoadingState, Spinner } from "@/components/states";
import { ProviderErrorActions } from "@/features/settings/ProviderErrorActions";
import { errorMessage, postJson } from "@/lib/api-client";
import { useFetch } from "@/lib/use-fetch";

// Security findings for one level or the whole project: what an attacker
// could do, then the fix, worst first.

interface Finding {
  id: number;
  path: string | null;
  line: number | null;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  attackerView: string;
  fix: string;
}

const SEVERITY_STYLE: Record<Finding["severity"], string> = {
  critical: "bg-danger text-bg",
  high: "border border-danger text-danger",
  medium: "border border-warn text-warn",
  low: "border border-border text-muted",
};

export function AuditPanel({
  projectId,
  levelId,
  scopeLabel,
  onShowInCode,
}: {
  projectId: number;
  levelId: number | null;
  scopeLabel: string;
  onShowInCode?: (path: string, line: number | null) => void;
}) {
  const url = `/api/projects/${projectId}/audit${levelId ? `?levelId=${levelId}` : ""}`;
  const { data, error, loading, reload } = useFetch<{ findings: Finding[] }>(url);
  const [ran, setRan] = useState<{ url: string; findings: Finding[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [runError, setRunError] = useState<Error | null>(null);
  const findings = ran?.url === url ? ran.findings : data?.findings;

  async function run() {
    setBusy(true);
    setRunError(null);
    try {
      const result = await postJson<{ findings: Finding[] }>(`/api/projects/${projectId}/audit`, {
        levelId,
      });
      setRan({ url, findings: result.findings });
    } catch (err) {
      setRunError(err instanceof Error ? err : new Error(errorMessage(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={`Security audit of ${scopeLabel}`} className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto font-semibold">Security audit · {scopeLabel}</h2>
        <button type="button" className="btn" onClick={run} disabled={busy}>
          {findings && findings.length > 0 ? "Run the audit again" : "Run the audit"}
        </button>
      </div>
      {busy && <Spinner label="The tutor is looking for security problems…" />}
      {runError && (
        <ErrorState message={runError.message}>
          <ProviderErrorActions error={runError} onSwitched={run} />
        </ErrorState>
      )}
      {loading && <LoadingState label="Loading findings…" />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {findings && findings.length === 0 && !busy && (
        <EmptyState title="No findings yet">
          Run the audit to check this code for injection, broken auth, leaked secrets and more.
        </EmptyState>
      )}
      <ul className="space-y-3">
        {findings?.map((f) => (
          <li key={f.id} className="card p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded px-1.5 py-0.5 text-xs font-semibold uppercase ${SEVERITY_STYLE[f.severity]}`}
              >
                {f.severity}
              </span>
              <span className="font-medium">{f.title}</span>
              {f.path && (
                <button
                  type="button"
                  className="ml-auto font-mono text-xs text-accent hover:underline"
                  onClick={() => f.path && onShowInCode?.(f.path, f.line)}
                  disabled={!onShowInCode}
                >
                  {f.path}
                  {f.line ? `:${f.line}` : ""}
                </button>
              )}
            </div>
            <p className="mt-2">
              <span className="text-security">An attacker could: </span>
              {f.attackerView}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-muted">
              <span className="text-ok">Fix: </span>
              {f.fix}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
