"use client";

import type { RebuildReview } from "@/shared/contracts";

// The review of a rebuild attempt. Citations to the original open it
// read-only in the editor, now that the attempt has been submitted.

type Cite = { file: string; line?: number | null } | null | undefined;

const RESULT_STYLE = { solid: "text-ok", shaky: "text-warn", missed: "text-danger" } as const;

export function ReviewPanel({
  review,
  onOpenOriginal,
}: {
  review: RebuildReview;
  onOpenOriginal: (path: string) => void;
}) {
  const passed = review.verdicts.filter((v) => v.passed).length;

  const citation = (ref: Cite) =>
    ref ? (
      <button
        type="button"
        className="font-mono text-xs text-accent hover:underline"
        onClick={() => onOpenOriginal(ref.file)}
      >
        original: {ref.file}
        {ref.line ? `:${ref.line}` : ""}
      </button>
    ) : null;

  return (
    <div className="space-y-4 p-4 text-sm">
      <div>
        <h2 className="text-base font-semibold">
          Review · {passed} of {review.verdicts.length} checks passed
        </h2>
        <p className="mt-1">{review.summary}</p>
      </div>

      <section aria-label="Acceptance checks">
        <ul className="space-y-2">
          {review.verdicts.map((v) => (
            <li key={v.check_id} className="rounded border border-border p-2">
              <span className={v.passed ? "text-ok" : "text-danger"}>
                {v.passed ? "✓ Passed" : "✗ Not yet"}
              </span>{" "}
              <span className="font-mono text-xs">{v.check_id}</span>
              <p className="mt-1">{v.explanation}</p>
              {citation(v.original)}
            </li>
          ))}
        </ul>
      </section>

      {review.bugs.length > 0 && (
        <Group title="Bugs">
          {review.bugs.map((b, i) => (
            <li key={i} className="rounded border border-danger/40 p-2">
              <span className="font-mono text-xs">
                {b.file}
                {b.line ? `:${b.line}` : ""}
              </span>
              <p className="mt-1">{b.description}</p>
              <p className="mt-1 text-muted">Fix: {b.fix}</p>
              {citation(b.original)}
            </li>
          ))}
        </Group>
      )}

      {review.security_gaps.length > 0 && (
        <Group title="Security gaps">
          {review.security_gaps.map((g, i) => (
            <li key={i} className="rounded border border-security/40 p-2">
              <span className="font-mono text-xs">
                {g.file}
                {g.line ? `:${g.line}` : ""}
              </span>
              <p className="mt-1">
                <span className="text-security">An attacker could: </span>
                {g.attacker_view}
              </p>
              <p className="mt-1 text-muted">Fix: {g.fix}</p>
            </li>
          ))}
        </Group>
      )}

      {review.approach_differences.length > 0 && (
        <Group title="Different, not wrong">
          {review.approach_differences.map((d, i) => (
            <li key={i} className="rounded border border-border p-2">
              <p>
                <span className="text-muted">You:</span> {d.learner}
              </p>
              <p>
                <span className="text-muted">Original:</span> {d.original}
              </p>
              <p className="mt-1">{d.note}</p>
              {citation(d.original_ref)}
            </li>
          ))}
        </Group>
      )}

      {review.concepts.length > 0 && (
        <Group title="Concepts">
          {review.concepts.map((c) => (
            <li key={c.name}>
              <span className={RESULT_STYLE[c.result]}>● {c.result}</span> <strong>{c.name}</strong>{" "}
              <span className="text-muted">{c.note}</span>
            </li>
          ))}
        </Group>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">{title}</h3>
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}
