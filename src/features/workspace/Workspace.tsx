"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { CodeViewer, type Selection } from "@/components/CodeViewer";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { announcePlace } from "@/components/StatusBar";
import { Prompt } from "@/components/terminal";
import { NotesPanel } from "@/features/annotations/NotesPanel";
import { AuditPanel } from "@/features/audit/AuditPanel";
import { QuizPanel } from "@/features/quiz/QuizPanel";
import { RebuildMode } from "@/features/rebuild/RebuildMode";
import { useAnnotations } from "@/features/annotations/useAnnotations";
import { TutorPanel } from "@/features/tutor/TutorPanel";
import { usePanelPlacement } from "@/features/tutor/usePanelPlacement";
import { apiFetch } from "@/lib/api-client";
import { estimateLessonTokens, formatTokens } from "@/lib/tokens";
import { useFetch } from "@/lib/use-fetch";
import { LevelSidebar } from "./LevelSidebar";
import { MODES, type Mode, type WorkspaceProps } from "./types";

// The three-pane workspace: levels and files on the left, the code in the
// middle, the tutor on the right, so the level, the code and the tutor are
// visible at once. The mode switch changes what the middle and right show.

const MODE_LABEL: Record<Mode, string> = {
  tour: "tour",
  rebuild: "rebuild",
  quiz: "quiz",
  audit: "audit",
};
/** Each step has its own colour (colour by role). */
const MODE_ROLE: Record<Mode, string> = {
  tour: "c-accent",
  rebuild: "c-number",
  quiz: "c-keyword",
  audit: "c-danger",
};

/** True when a key press belongs to something the learner is typing in. */
function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    !!target.closest("input, textarea, select, [contenteditable='true'], .monaco-editor")
  );
}
const AVAILABLE_MODES: Mode[] = ["tour", "rebuild", "quiz", "audit"];
/** What the prompt shows for each mode, as if it were typed. */
const MODE_COMMAND: Record<Mode, string> = {
  tour: "retrace tour",
  rebuild: "retrace rebuild",
  quiz: "retrace quiz",
  audit: "retrace audit",
};

/** "Data model & API" → "data-model-api", for the prompt path. */
function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "level"
  );
}

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
  const router = useRouter();
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
  const [focusLine, setFocusLine] = useState<number | null>(initial.line ?? null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [marking, setMarking] = useState(false);
  const panel = usePanelPlacement();
  const tutorControl = useRef<{ teach: () => void } | null>(null);
  const [lessonLevels, setLessonLevels] = useState<number[]>([]);

  const level = levels.find((l) => l.id === levelId) ?? null;
  const fileMeta = useMemo(() => files.find((f) => f.id === fileId) ?? null, [files, fileId]);
  const filePaths = useMemo(() => new Set(files.map((f) => f.path)), [files]);
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

  // The status line names the level the learner is on.
  useEffect(() => {
    announcePlace(level ? `level ${level.number}` : "workspace");
  }, [level]);

  // j/k move between levels and 1-4 switch steps, but never while typing.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      if (event.key === "j" || event.key === "k") {
        if (levels.length === 0) return;
        const at = levels.findIndex((l) => l.id === levelId);
        const next =
          levels[Math.min(Math.max(at + (event.key === "j" ? 1 : -1), 0), levels.length - 1)];
        if (next && next.id !== levelId) chooseLevel(next.id);
        event.preventDefault();
      } else if (/^[1-4]$/.test(event.key)) {
        setMode(MODES[Number(event.key) - 1]!);
        event.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function chooseLevel(id: number) {
    setLevelId(id);
    setFileId(firstFileOf(id));
    setOpenLine(null);
    setSelection(null);
  }

  function chooseFile(id: number) {
    setFileId(id);
    setOpenLine(null);
    setFocusLine(null);
    setSelection(null);
    const owner = files.find((f) => f.id === id)?.levelId;
    if (owner && owner !== levelId && !showAll) setLevelId(owner);
  }

  /** A file path the tutor or the audit mentioned was clicked: show it in Tour mode. */
  function openFileByPath(path: string, line: number | null) {
    const target = files.find((f) => f.path === path);
    if (!target) return;
    chooseFile(target.id);
    setMode("tour");
    if (line) setFocusLine(line);
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

  async function markCheckpointPassed() {
    if (!level) return;
    setMarking(true);
    try {
      await apiFetch(`/api/projects/${project.id}/levels/${level.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      });
      router.refresh();
    } finally {
      setMarking(false);
    }
  }

  const tutorDocked = !panel.placement.floating;
  // Whole class names, so Tailwind can find them when it scans the source.
  const gridColumns = !tutorDocked
    ? "lg:grid-cols-[260px_minmax(0,1fr)]"
    : panel.placement.collapsed
      ? "lg:grid-cols-[260px_minmax(0,1fr)_40px]"
      : "lg:grid-cols-[260px_minmax(0,1fr)_400px]";

  const tutor = (
    <TutorPanel
      projectId={project.id}
      level={level}
      file={fileMeta ? { id: fileMeta.id, path: fileMeta.path } : null}
      selection={selection}
      filePaths={filePaths}
      onOpenFile={openFileByPath}
      panel={panel}
      controlRef={tutorControl}
      onLessonLevels={setLessonLevels}
    />
  );

  // The next-step bar: one action that moves the learner forward.
  const levelIndex = levels.findIndex((l) => l.id === levelId);
  const following = levels.slice(levelIndex + 1).find((l) => !l.skipped) ?? null;
  const levelLines = files
    .filter((f) => f.levelId === levelId)
    .reduce((n, f) => n + f.lineCount, 0);
  const hasLesson = level ? lessonLevels.includes(level.number) : false;
  const goNext = following
    ? {
        text: `next: level ${following.number} · ${following.name}`,
        label: "open next level",
        run: () => chooseLevel(following.id),
      }
    : null;
  const next: { text: string; cost?: string; label: string; run: () => void } | null = !level
    ? null
    : mode === "tour"
      ? !hasLesson
        ? {
            text: `tour level ${level.number} · ${level.name}`,
            cost: `about ${formatTokens(estimateLessonTokens(levelLines))} tokens`,
            label: "tour this level",
            run: () => tutorControl.current?.teach(),
          }
        : level.skipped || level.status === "done"
          ? goNext
          : {
              text: `rebuild level ${level.number} yourself, from a spec`,
              label: "go to rebuild",
              run: () => setMode("rebuild"),
            }
      : mode === "rebuild"
        ? { text: "check what you learned", label: "take the quiz", run: () => setMode("quiz") }
        : mode === "quiz"
          ? {
              text: "look for security problems in this level",
              label: "audit this level",
              run: () => setMode("audit"),
            }
          : goNext;

  return (
    <div className="flex h-[calc(100dvh-var(--chrome))] min-h-0 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-3 pb-1">
        <Prompt
          className="max-w-full"
          path={[
            { label: project.name, href: `/projects/${project.id}` },
            level
              ? { label: `L${String(level.number).padStart(2, "0")}-${slug(level.name)}` }
              : { label: "workspace" },
          ]}
          command={MODE_COMMAND[mode]}
        />
        {level && !level.skipped && (
          <button
            type="button"
            className="btn btn-ghost text-xs"
            onClick={markCheckpointPassed}
            disabled={marking || level.status === "done"}
            title={`Checkpoint: ${level.checkpoint}`}
          >
            {level.status === "done" ? "✓ Level done" : "I passed the checkpoint"}
          </button>
        )}
        <div
          role="tablist"
          aria-label="Mode"
          className="ml-auto flex gap-1"
          onKeyDown={(event) => {
            // Left/Right arrows move between modes, as in any tab list.
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            const step = event.key === "ArrowRight" ? 1 : -1;
            const next =
              AVAILABLE_MODES[
                (AVAILABLE_MODES.indexOf(mode) + step + AVAILABLE_MODES.length) %
                  AVAILABLE_MODES.length
              ]!;
            setMode(next);
            (
              event.currentTarget.querySelector(`[data-mode="${next}"]`) as HTMLElement | null
            )?.focus();
          }}
        >
          {MODES.map((m) => {
            const available = AVAILABLE_MODES.includes(m);
            return (
              <button
                key={m}
                type="button"
                role="tab"
                data-mode={m}
                tabIndex={mode === m ? 0 : -1}
                aria-selected={mode === m}
                disabled={!available}
                title={available ? undefined : "Coming in a later phase"}
                onClick={() => setMode(m)}
                className={`tab ${MODE_ROLE[m]} text-sm disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <span aria-hidden className={mode === m ? "" : "text-comment"}>
                  {MODES.indexOf(m) + 1}:
                </span>
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

      {mode === "rebuild" ? (
        // The tutor sits out Rebuild mode: it can see the original code.
        <RebuildMode
          projectId={project.id}
          level={level}
          levels={levels}
          files={files}
          onLevel={chooseLevel}
        />
      ) : (
        <>
          <div
            className={`grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto px-3 pt-4 pb-2 lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden ${gridColumns}`}
          >
            <aside
              aria-label="Levels and files"
              className="pane pane-flush c-keyword h-[300px] min-h-0 lg:h-auto"
            >
              <span aria-hidden className="pane-title">
                levels
              </span>
              {levels.length > 0 && (
                <span aria-hidden className="pane-note">
                  {levels.filter((l) => l.status === "done").length}/
                  {levels.filter((l) => !l.skipped).length}
                </span>
              )}
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

            {mode === "audit" && (
              <section
                aria-label="Audit"
                className="pane pane-flush pane-on c-danger min-h-0 min-w-0"
              >
                <span aria-hidden className="pane-title">
                  audit
                </span>
                <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
                  <AuditPanel
                    key={levelId ?? "project"}
                    projectId={project.id}
                    levelId={level && !level.skipped ? level.id : null}
                    scopeLabel={
                      level && !level.skipped
                        ? `Level ${level.number}: ${level.name}`
                        : "whole project"
                    }
                    onShowInCode={openFileByPath}
                  />
                </div>
              </section>
            )}
            {mode === "quiz" && (
              <section
                aria-label="Quiz"
                className="pane pane-flush pane-on c-keyword min-h-0 min-w-0"
              >
                <span aria-hidden className="pane-title">
                  quiz
                </span>
                <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
                  <QuizPanel
                    key={levelId ?? "project"}
                    projectId={project.id}
                    levelId={level && !level.skipped ? level.id : null}
                    scopeLabel={
                      level && !level.skipped
                        ? `Level ${level.number}: ${level.name}`
                        : "whole project"
                    }
                  />
                </div>
              </section>
            )}
            <section
              aria-label="Code"
              className={`pane pane-flush pane-on c-accent min-h-[420px] min-w-0 flex-col lg:min-h-0 ${mode === "tour" ? "flex" : "hidden"}`}
            >
              <span aria-hidden className="pane-title">
                {data?.file.path ?? "code"}
              </span>
              {level && (
                <span aria-hidden className="pane-note">
                  level {level.number}
                </span>
              )}
              {!fileId && (
                <div className="p-6">
                  <EmptyState title="No file open">
                    {level?.skipped
                      ? "This level has no files in the project. Ask the tutor to teach it as a missing level."
                      : "Pick a file on the left."}
                  </EmptyState>
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
                  <div className="px-3 pb-1.5 text-xs text-comment">
                    <span className="sr-only">{data.file.path} · </span>
                    {data.file.lineCount} lines
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
                      focusLine={focusLine}
                    />
                  </div>
                  <div className="h-44 shrink-0 overflow-hidden border-t border-dashed border-rule">
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

            {tutorDocked && (
              <aside
                aria-label="Tutor panel"
                className={`min-h-[420px] lg:min-h-0 ${panel.placement.collapsed ? "" : "pane pane-flush c-ok"}`}
              >
                {!panel.placement.collapsed && (
                  <span aria-hidden className="pane-title">
                    tutor
                  </span>
                )}
                {tutor}
              </aside>
            )}
          </div>
          {!tutorDocked && tutor}
        </>
      )}

      {next && (
        <div
          className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-dashed border-rule px-4 py-1.5 ${MODE_ROLE[mode]}`}
        >
          <span className="min-w-0 truncate text-muted">
            <span aria-hidden className="text-role">
              {"→ "}
            </span>
            {next.text}
          </span>
          <span className="flex items-center gap-3">
            {next.cost && <span className="text-xs text-comment">{next.cost}</span>}
            <button type="button" className="btn btn-primary" onClick={next.run}>
              {next.label}
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
