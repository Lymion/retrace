import type { ProjectAnalysis } from "@/shared/analysis";

// The one-page project summary: what's in the upload, where it starts, what
// it depends on and how much history we could read. Pure render, no AI.

export function AnalysisOverview({
  analysis,
  aiSummary,
}: {
  analysis: ProjectAnalysis;
  aiSummary?: string | null;
}) {
  const totalLines = Math.max(analysis.totalLines, 1);
  const runtimeDeps = analysis.dependencies.filter((d) => !d.dev);
  const devDeps = analysis.dependencies.filter((d) => d.dev);

  return (
    <section aria-labelledby="summary-heading" className="card space-y-5 p-5">
      <h2 id="summary-heading" className="text-lg font-semibold">
        Project summary
      </h2>
      {aiSummary && <p className="max-w-3xl leading-relaxed">{aiSummary}</p>}

      <div>
        <p className="text-sm text-muted">
          {analysis.fileCount} files · {analysis.totalLines.toLocaleString("en")} lines
        </p>
        <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
          {analysis.languages.map((lang, i) => (
            <span
              key={lang.name}
              style={{ width: `${(lang.lines / totalLines) * 100}%` }}
              className={
                ["bg-accent", "bg-pattern", "bg-gotcha", "bg-ok", "bg-security", "bg-muted"][i % 6]
              }
            />
          ))}
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {analysis.languages.map((lang) => (
            <li key={lang.name}>
              {lang.name}{" "}
              <span className="text-muted">{Math.round((lang.lines / totalLines) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>

      <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Fact title="Entry points">
          {analysis.entryPoints.length ? (
            <ul className="space-y-0.5 font-mono text-xs">
              {analysis.entryPoints.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : (
            "None found"
          )}
        </Fact>
        <Fact title="Layers">
          <ul className="space-y-0.5">
            {Object.entries(analysis.layers)
              .filter(([, n]) => n > 0)
              .map(([layer, n]) => (
                <li key={layer}>
                  {layer} <span className="text-muted">{n}</span>
                </li>
              ))}
          </ul>
        </Fact>
        <Fact title="Git history">
          {analysis.history.available
            ? `${analysis.history.commitCount} commits${analysis.history.truncated ? " (older ones not available)" : ""}`
            : "Not included. The order is worked out from imports instead."}
        </Fact>
        <Fact title="Imports found">
          {analysis.imports.length} links between files, {analysis.externalImports.length} packages
        </Fact>
      </dl>

      {analysis.dependencies.length > 0 && (
        <div className="text-sm">
          <h3 className="font-medium">Dependencies</h3>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {runtimeDeps.map((d) => (
              <li
                key={`${d.manifest}:${d.name}`}
                className="chip"
                title={`${d.manifest} ${d.version ?? ""}`}
              >
                {d.name}
              </li>
            ))}
            {devDeps.map((d) => (
              <li
                key={`${d.manifest}:${d.name}`}
                className="chip opacity-70"
                title={`dev · ${d.manifest}`}
              >
                {d.name} <span className="text-[10px]">dev</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {analysis.skipped.length > 0 && (
        <p className="text-xs text-muted">
          Skipped: {analysis.skipped.map((s) => `${s.count} ${s.reason}`).join(", ")}.
        </p>
      )}
    </section>
  );
}

function Fact({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{title}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}
