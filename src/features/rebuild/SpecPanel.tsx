"use client";

import type { RebuildSpec } from "@/shared/contracts";

// The spec the learner builds from. It never contains the original code.

export function SpecPanel({
  spec,
  earlierFiles,
  onOpenEarlier,
  onNewSpec,
  busy,
}: {
  spec: RebuildSpec;
  earlierFiles: { id: number; path: string; levelNumber: number }[];
  onOpenEarlier: (file: { id: number; path: string }) => void;
  onNewSpec: () => void;
  busy: boolean;
}) {
  return (
    <div className="space-y-4 p-4 text-sm">
      <div>
        <h2 className="text-base font-semibold">{spec.title}</h2>
        <p className="mt-1">{spec.summary}</p>
      </div>

      <Section title="Files to write">
        <ul className="space-y-1">
          {spec.files_to_write.map((f) => (
            <li key={f.path}>
              <code className="font-mono text-xs text-accent">{f.path}</code>
              <span className="block text-muted">{f.purpose}</span>
            </li>
          ))}
        </ul>
      </Section>

      {spec.inputs.length > 0 && (
        <Section title="Inputs">
          <ul className="list-disc space-y-0.5 pl-4">
            {spec.inputs.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Section>
      )}

      {spec.outputs.length > 0 && (
        <Section title="Outputs">
          <ul className="list-disc space-y-0.5 pl-4">
            {spec.outputs.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Acceptance checks">
        <ol className="space-y-2">
          {spec.acceptance_checks.map((check) => (
            <li key={check.id} className="rounded border border-border p-2">
              <span className="font-mono text-xs text-accent">{check.id}</span> {check.description}
              <span className="mt-0.5 block text-xs text-muted">
                How to check: {check.how_to_verify}
              </span>
            </li>
          ))}
        </ol>
      </Section>

      {spec.concepts.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {spec.concepts.map((c) => (
            <span key={c} className="chip">
              {c}
            </span>
          ))}
        </div>
      )}

      {earlierFiles.length > 0 && (
        <Section title="You already have (read-only)">
          <ul className="space-y-0.5">
            {earlierFiles.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  className="font-mono text-xs text-muted hover:text-text"
                  onClick={() => onOpenEarlier(f)}
                >
                  L{f.levelNumber} · {f.path}
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <p className="text-xs text-muted">
        This level&apos;s original code and later levels are hidden, and the tutor is out of the
        room, until you submit. Different from the original is fine: the review only flags broken
        checks, bugs and security gaps.
      </p>
      <button type="button" className="btn text-xs" onClick={onNewSpec} disabled={busy}>
        Start over with a new spec
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}
