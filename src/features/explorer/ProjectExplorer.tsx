"use client";

import { useState } from "react";
import { FileTree, type TreeFile } from "@/components/FileTree";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { useFetch } from "@/lib/use-fetch";

export interface ExplorerFile {
  id: number;
  path: string;
  language: string;
  lineCount: number;
}

export interface ExplorerRedaction {
  id: number;
  fileId: number;
  path: string;
  line: number;
  kind: string;
}

interface FileContent {
  id: number;
  path: string;
  language: string;
  content: string;
}

export function ProjectExplorer({
  projectId,
  files,
  redactions,
}: {
  projectId: number;
  files: ExplorerFile[];
  redactions: ExplorerRedaction[];
}) {
  const [selectedId, setSelectedId] = useState<number | null>(files[0]?.id ?? null);
  const { data, error, loading, reload } = useFetch<{ file: FileContent }>(
    selectedId === null ? null : `/api/projects/${projectId}/files/${selectedId}`,
  );

  if (files.length === 0) {
    return <EmptyState title="This project has no readable files." />;
  }

  const treeFiles: TreeFile[] = files.map((f) => ({ id: f.id, path: f.path }));

  return (
    <div className="grid min-h-0 gap-4 lg:grid-cols-[280px_1fr]">
      <div className="card max-h-[70vh] overflow-auto p-2">
        <FileTree files={treeFiles} selectedId={selectedId} onSelect={(f) => setSelectedId(f.id)} />
      </div>
      <div className="card flex min-h-[300px] min-w-0 flex-col overflow-hidden">
        {loading && <LoadingState label="Opening file…" />}
        {error && (
          <div className="p-4">
            <ErrorState message={error} onRetry={reload} />
          </div>
        )}
        {data && <PlainCodeView path={data.file.path} content={data.file.content} />}
      </div>
      {redactions.length > 0 && (
        <section aria-labelledby="redactions" className="card p-4 lg:col-span-2">
          <h2 id="redactions" className="font-semibold">
            {redactions.length} secret{redactions.length === 1 ? "" : "s"} removed
          </h2>
          <p className="mt-1 text-sm text-muted">
            These values were replaced with a «REDACTED» marker before anything was saved. They
            never reach the database or the AI.
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {redactions.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="font-mono text-accent hover:underline"
                  onClick={() => setSelectedId(r.fileId)}
                >
                  {r.path}:{r.line}
                </button>{" "}
                <span className="text-muted">{r.kind}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PlainCodeView({ path, content }: { path: string; content: string }) {
  const lines = content.split("\n");
  return (
    <>
      <div className="border-b border-border px-3 py-2 font-mono text-xs text-muted">{path}</div>
      <pre className="flex-1 overflow-auto p-0 text-[13px] leading-5">
        <code className="grid grid-cols-[auto_1fr]">
          {lines.map((line, i) => (
            <span key={i} className="contents">
              <span className="select-none pr-3 pl-3 text-right text-muted/60">{i + 1}</span>
              <span className="pr-4 whitespace-pre">{line || " "}</span>
            </span>
          ))}
        </code>
      </pre>
    </>
  );
}
