"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CodeViewer, type Selection } from "@/components/CodeViewer";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { NotesPanel } from "@/features/annotations/NotesPanel";
import { useAnnotations } from "@/features/annotations/useAnnotations";
import { apiFetch } from "@/lib/api-client";
import { useFetch } from "@/lib/use-fetch";
import { LevelSidebar } from "./LevelSidebar";
import { MODES, type Mode, type WorkspaceProps } from "./types";

// The three-pane workspace: levels and files on the left, the code in the
// middle, the tutor on the right, so the level, the code and the tutor are
// visible at once. The mode switch changes what the middle and right show.

const MODE_LABEL: Record<Mode, string> = {
  tour: "Tour",
  rebuild: "Rebuild",
  quiz: "Quiz",
  audit: "Audit",
};
const AVAILABLE_MODES: Mode[] = ["tour"];

interface FileContent {
  id: number;
  path: string;
  language: string;
  lineCount: number;
  content: string;
}

export function Workspace({
  project,
  levels,
  files,
  depth: initialDepth,
  initial,
}: WorkspaceProps) {
  const firstFileOf = (id: number | null) => files.find((f) => f.levelId === id)?.id ?? null;
  const fileLevel = files.find((f) => f.id === initial.fileId)?.levelId ?? null;
  const defaultLevel =
    initial.levelId ?? fileLevel ?? levels.find((l) => !l.skipped)?.id ?? levels[0]?.id ?? null;

  const [mode, setMode] = useState<Mode>(initial.mode);
  const [levelId, setLevelId] = useState<number | null>(defaultLevel);
  const [fileId, setFileId] = useState<number | null>(
    initial.fileId ??
      firstFileOf(defaultLevel) ??
      (levels.length === 0 ? (files[0]?.id ?? null) : null),
  );
  const [showAll, setShowAll] = useState(levels.length === 0);
  const [depth, setDepth] = useState(initialDepth);
  const [openLine, setOpenLine] = useState<number | null>(null);
  const [, setSelection] = useState<Selection | null>(null);

  const level = levels.find((l) => l.id === levelId) ?? null;
  const fileMeta = useMemo(() => files.find((f) => f.id === fileId) ?? null, [files, fileId]);
  const { data, error, loading, reload } = useFetch<{ file: FileContent }>(
    fileId ? `/api/projects/${project.id}/files/${fileId}` : null,
  );
  const notes = useAnnotations(project.id, mode === "tour" ? fileMeta : null, depth);

  // Keep the URL in step, so a refresh or a shared link opens the same view.
  useEffect(() => {
    const params = new URLSearchParams();
    if (levelId) params.set("level", String(levelId));
    if (fileId) params.set("file", String(fileId));
    params.set("mode", mode);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, [levelId, fileId, mode]);

  function chooseLevel(id: number) {
    setLevelId(id);
    setFileId(firstFileOf(id));
    setOpenLine(null);
  }

  function chooseFile(id: number) {
    setFileId(id);
    setOpenLine(null);
    const owner = files.find((f) => f.id === id)?.levelId;
    if (owner && owner !== levelId && !showAll) setLevelId(owner);
  }

  function changeDepth(value: typeof depth) {
    setDepth(value);
    // Depth is a setting, so the tutor uses it everywhere from now on.
    void apiFetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ depth: value }),
    }).catch(() => undefined);
  }

  return (
    <div className="flex h-[calc(100dvh-3rem)] min-h-0 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2">
        <nav aria-label="Breadcrumb" className="min-w-0 truncate text-sm text-muted">
          <Link href={`/projects/${project.id}`} className="hover:text-text">
            {project.name}
          </Link>
          {level && (
            <>
              {" / "}
              <span className="text-text">
                Level {level.number}: {level.name}
              </span>
            </>
          )}
        </nav>
        <div
          role="tablist"
          aria-label="Mode"
          className="ml-auto flex rounded-md border border-border p-0.5"
        >
          {MODES.map((m) => {
            const available = AVAILABLE_MODES.includes(m);
            return (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                disabled={!available}
                title={available ? undefined : "Coming in a later phase"}
                onClick={() => setMode(m)}
                className={`rounded px-3 py-1 text-sm ${
                  mode === m ? "bg-accent-strong text-white" : "text-muted hover:text-text"
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                {MODE_LABEL[m]}
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          Depth
          <select
            className="input w-auto py-1"
            value={depth}
            onChange={(e) => changeDepth(e.target.value as typeof depth)}
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </label>
      </div>

      {levels.length === 0 && (
        <p className="border-b border-border bg-warn/10 px-4 py-1.5 text-sm">
          No roadmap yet, so files are not grouped into levels.{" "}
          <Link href={`/projects/${project.id}`} className="text-accent underline">
            Build the roadmap
          </Link>{" "}
          to tour the project level by level.
        </p>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_400px] lg:grid-rows-[minmax(0,1fr)]">
        <aside aria-label="Levels and files" className="min-h-0 border-r border-border bg-surface">
          <LevelSidebar
            levels={levels}
            files={files}
            levelId={levelId}
            fileId={fileId}
            dimAfter={null}
            showAll={showAll}
            onShowAll={setShowAll}
            onLevel={chooseLevel}
            onFile={chooseFile}
          />
        </aside>

        <section aria-label="Code" className="flex min-h-0 min-w-0 flex-col">
          {!fileId && (
            <div className="p-6">
              <EmptyState title="No file open">Pick a file on the left.</EmptyState>
            </div>
          )}
          {fileId && loading && <LoadingState label="Opening file…" />}
          {fileId && error && (
            <div className="p-4">
              <ErrorState message={error} onRetry={reload} />
            </div>
          )}
          {data && (
            <>
              <div className="border-b border-border px-3 py-1.5 font-mono text-xs text-muted">
                {data.file.path} · {data.file.lineCount} lines
              </div>
              <div className="min-h-0 flex-1">
                <CodeViewer
                  path={data.file.path}
                  language={data.file.language}
                  content={data.file.content}
                  notes={notes.notes}
                  openLine={openLine}
                  onOpenLine={setOpenLine}
                  onSelection={setSelection}
                />
              </div>
              <div className="h-44 shrink-0 overflow-hidden border-t border-border bg-surface">
                <NotesPanel
                  notes={notes.notes}
                  loading={notes.loading}
                  regenerating={notes.regenerating}
                  error={notes.error}
                  openLine={openLine}
                  onOpen={setOpenLine}
                  onRetry={notes.retry}
                  onRegenerate={notes.regenerate}
                />
              </div>
            </>
          )}
        </section>

        <aside
          aria-label="Tutor"
          className="hidden min-h-0 border-l border-border bg-surface lg:block"
        >
          <div className="p-4 text-sm text-muted">The tutor chat appears here.</div>
        </aside>
      </div>
    </div>
  );
}
