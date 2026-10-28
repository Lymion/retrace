"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CodeViewer } from "@/components/CodeViewer";
import { EmptyState, ErrorState, LoadingState, Spinner } from "@/components/states";
import type { LevelView } from "@/features/roadmap/LevelMap";
import { ProviderErrorActions } from "@/features/settings/ProviderErrorActions";
import { LevelSidebar } from "@/features/workspace/LevelSidebar";
import type { WorkspaceFile } from "@/features/workspace/types";
import { apiFetch, errorMessage, postJson } from "@/lib/api-client";
import { useFetch } from "@/lib/use-fetch";
import { detectLanguage } from "@/server/ingest/language";
import { ReviewPanel } from "./ReviewPanel";
import { SpecPanel } from "./SpecPanel";
import type { Attempt, RebuildFile, Tab } from "./types";

// Rebuild mode: spec on the left, the learner's files in the middle, the
// review on the right. Everything from this level onwards is hidden until
// the attempt is reviewed; earlier levels stay readable.

type Busy = "spec" | "review" | null;

export function RebuildMode({
  projectId,
  level,
  levels,
  files,
  onLevel,
}: {
  projectId: number;
  level: LevelView | null;
  levels: LevelView[];
  files: WorkspaceFile[];
  onLevel: (id: number) => void;
}) {
  const router = useRouter();
  const latest = useFetch<{ attempt: Attempt | null }>(
    level ? `/api/projects/${projectId}/levels/${level.id}/rebuild` : null,
  );
  // Newer than the fetched attempt once the learner acts (new spec, review).
  const [local, setLocal] = useState<{ levelId: number; attempt: Attempt } | null>(null);
  const attempt =
    level && local?.levelId === level.id ? local.attempt : (latest.data?.attempt ?? null);

  const [drafts, setDrafts] = useState<{ attemptId: number; files: RebuildFile[] } | null>(null);
  const myFiles = attempt ? (drafts?.attemptId === attempt.id ? drafts.files : attempt.files) : [];
  const [tabs, setTabs] = useState<{
    attemptId: number | null;
    open: Tab[];
    active: string | null;
  }>({
    attemptId: null,
    open: [],
    active: null,
  });
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<Error | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [newPath, setNewPath] = useState("");

  const levelNumber = level?.number ?? 0;
  const numberOf = useMemo(() => new Map(levels.map((l) => [l.id, l.number])), [levels]);
  const earlierFiles = files
    .filter((f) => f.levelId !== null && (numberOf.get(f.levelId) ?? 0) < levelNumber)
    .map((f) => ({ id: f.id, path: f.path, levelNumber: numberOf.get(f.levelId!) ?? 0 }));
  const reviewed = attempt?.status === "reviewed";

  // Tabs belong to one attempt; a new attempt starts with its own files.
  const openTabs: Tab[] =
    attempt && tabs.attemptId === attempt.id
      ? tabs.open
      : myFiles.map((f) => ({ kind: "mine" as const, path: f.path }));
  const activeKey =
    attempt && tabs.attemptId === attempt.id
      ? tabs.active
      : openTabs[0]
        ? keyOf(openTabs[0])
        : null;
  const activeTab = openTabs.find((t) => keyOf(t) === activeKey) ?? null;

  const original = useFetch<{ file: { content: string; language: string; path: string } }>(
    activeTab?.kind === "original" ? `/api/projects/${projectId}/files/${activeTab.fileId}` : null,
  );

  // Autosave the learner's files a moment after they stop typing.
  useEffect(() => {
    if (!drafts || !attempt || drafts.attemptId !== attempt.id || reviewed) return;
    const timer = window.setTimeout(() => {
      setSaveState("saving");
      apiFetch(`/api/projects/${projectId}/rebuild/${drafts.attemptId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: drafts.files }),
      }).then(
        () => setSaveState("saved"),
        () => setSaveState("error"),
      );
    }, 800);
    return () => window.clearTimeout(timer);
  }, [drafts, attempt, projectId, reviewed]);

  function setTabsFor(open: Tab[], active: string | null) {
    if (attempt) setTabs({ attemptId: attempt.id, open, active });
  }

  function openTab(tab: Tab) {
    const exists = openTabs.some((t) => keyOf(t) === keyOf(tab));
    setTabsFor(exists ? openTabs : [...openTabs, tab], keyOf(tab));
  }

  function closeTab(tab: Tab) {
    const rest = openTabs.filter((t) => keyOf(t) !== keyOf(tab));
    setTabsFor(rest, rest[0] ? keyOf(rest[0]) : null);
  }

  function editFile(path: string, content: string) {
    if (!attempt) return;
    setDrafts({
      attemptId: attempt.id,
      files: myFiles.map((f) => (f.path === path ? { ...f, content } : f)),
    });
  }

  function addFile(event: React.FormEvent) {
    event.preventDefault();
    const path = newPath.trim().replace(/^\.?\//, "");
    if (!attempt || !path || myFiles.some((f) => f.path === path)) return;
    setDrafts({ attemptId: attempt.id, files: [...myFiles, { path, content: "" }] });
    openTab({ kind: "mine", path });
    setNewPath("");
  }

  function openOriginal(path: string) {
    const file = files.find((f) => f.path === path);
    if (!file) return;
    const fileLevel = file.levelId !== null ? (numberOf.get(file.levelId) ?? 0) : 0;
    // Only earlier levels before a review; this level's original once it is reviewed.
    if (fileLevel < levelNumber || (reviewed && fileLevel === levelNumber)) {
      openTab({ kind: "original", path: file.path, fileId: file.id });
    }
  }

  async function run(kind: Exclude<Busy, null>, action: () => Promise<{ attempt: Attempt }>) {
    if (!level) return;
    setBusy(kind);
    setError(null);
    try {
      const { attempt: next } = await action();
      setLocal({ levelId: level.id, attempt: next });
      setDrafts(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(errorMessage(err)));
    } finally {
      setBusy(null);
    }
  }

  const newSpec = () => {
    if (
      attempt &&
      !window.confirm(
        "Start over with a new spec? Your current files stay saved in the old attempt.",
      )
    )
      return;
    void run("spec", () => postJson(`/api/projects/${projectId}/levels/${level!.id}/rebuild`, {}));
  };
  const submit = () =>
    void run("review", () =>
      postJson(`/api/projects/${projectId}/rebuild/${attempt!.id}/review`, { files: myFiles }),
    );

  const errorBox = error && (
    <ErrorState message={error.message}>
      <ProviderErrorActions error={error} />
    </ErrorState>
  );

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)_380px] lg:grid-rows-[minmax(0,1fr)]">
      <aside aria-label="Spec" className="flex min-h-0 flex-col border-r border-border bg-surface">
        <div className="max-h-[35%] shrink-0 overflow-auto">
          <LevelSidebar
            levels={levels}
            files={[]}
            levelId={level?.id ?? null}
            fileId={null}
            dimAfter={levelNumber}
            showAll={false}
            onShowAll={() => undefined}
            onLevel={onLevel}
            onFile={() => undefined}
            showFiles={false}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {!level && (
            <div className="p-4">
              <EmptyState title="Pick a level">
                Build the roadmap first, then choose a level to rebuild.
              </EmptyState>
            </div>
          )}
          {level && latest.loading && <LoadingState label="Loading your rebuild…" />}
          {level && latest.error && (
            <div className="p-4">
              <ErrorState message={latest.error} onRetry={latest.reload} />
            </div>
          )}
          {level && !latest.loading && !attempt && (
            <div className="space-y-3 p-4 text-sm">
              <p>
                Rebuild{" "}
                <strong>
                  level {level.number}: {level.name}
                </strong>{" "}
                yourself. You get a spec with inputs, outputs and three acceptance checks, but not
                the original code.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={newSpec}
                disabled={busy !== null}
              >
                Get the spec
              </button>
              {busy === "spec" && <Spinner label="Writing your spec…" />}
              {errorBox}
            </div>
          )}
          {attempt && (
            <SpecPanel
              spec={attempt.spec}
              earlierFiles={earlierFiles}
              onOpenEarlier={(f) => openOriginal(f.path)}
              onNewSpec={newSpec}
              busy={busy !== null}
            />
          )}
        </div>
      </aside>

      <section aria-label="Your files" className="flex min-h-0 min-w-0 flex-col">
        {!attempt ? (
          <div className="p-6">
            <EmptyState title="No files yet">Get a spec to start writing.</EmptyState>
          </div>
        ) : (
          <>
            <div
              role="tablist"
              aria-label="Open files"
              className="flex items-center gap-1 overflow-x-auto border-b border-border px-2 py-1"
            >
              {openTabs.map((tab) => (
                <span key={keyOf(tab)} className="flex shrink-0 items-center">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={keyOf(tab) === activeKey}
                    onClick={() => setTabsFor(openTabs, keyOf(tab))}
                    className={`rounded px-2 py-1 font-mono text-xs ${
                      keyOf(tab) === activeKey
                        ? "bg-surface-2 text-text"
                        : "text-muted hover:text-text"
                    }`}
                  >
                    {tab.kind === "original" ? "🔒 " : ""}
                    {tab.path}
                  </button>
                  {tab.kind === "original" && (
                    <button
                      type="button"
                      className="px-1 text-xs text-muted hover:text-text"
                      onClick={() => closeTab(tab)}
                      aria-label={`Close ${tab.path}`}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
              {!reviewed && (
                <form onSubmit={addFile} className="ml-auto flex shrink-0 items-center gap-1">
                  <label htmlFor="new-file" className="sr-only">
                    New file path
                  </label>
                  <input
                    id="new-file"
                    className="input w-44 py-0.5 font-mono text-xs"
                    placeholder="add file, e.g. server/x.js"
                    value={newPath}
                    onChange={(e) => setNewPath(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="btn px-2 py-0.5 text-xs"
                    disabled={!newPath.trim()}
                  >
                    Add
                  </button>
                </form>
              )}
            </div>
            <div className="min-h-0 flex-1">
              {activeTab?.kind === "mine" && (
                <CodeViewer
                  key={`mine:${attempt.id}:${activeTab.path}`}
                  path={`rebuild/${attempt.id}/${activeTab.path}`}
                  language={detectLanguage(activeTab.path)}
                  content={myFiles.find((f) => f.path === activeTab.path)?.content ?? ""}
                  readOnly={reviewed}
                  onChange={(value) => editFile(activeTab.path, value)}
                />
              )}
              {activeTab?.kind === "original" &&
                (original.data ? (
                  <CodeViewer
                    path={`original/${original.data.file.path}`}
                    language={original.data.file.language}
                    content={original.data.file.content}
                  />
                ) : original.error ? (
                  <div className="p-4">
                    <ErrorState message={original.error} onRetry={original.reload} />
                  </div>
                ) : (
                  <LoadingState label="Opening file…" />
                ))}
            </div>
            <div className="flex items-center gap-3 border-t border-border px-3 py-2 text-xs text-muted">
              <span aria-live="polite">
                {reviewed
                  ? "Reviewed. Start over with a new spec to try again."
                  : saveState === "saving"
                    ? "Saving…"
                    : saveState === "error"
                      ? "Could not save your draft."
                      : "Draft saved on this computer."}
              </span>
              {!reviewed && (
                <button
                  type="button"
                  className="btn btn-primary ml-auto"
                  onClick={submit}
                  disabled={busy !== null || myFiles.every((f) => !f.content.trim())}
                >
                  Submit for review
                </button>
              )}
            </div>
          </>
        )}
      </section>

      <aside
        aria-label="Review"
        className="min-h-0 overflow-auto border-l border-border bg-surface"
      >
        {busy === "review" && (
          <div className="p-4">
            <Spinner label="The tutor is comparing your code with the original…" />
          </div>
        )}
        {busy !== "spec" && attempt && error && <div className="p-4">{errorBox}</div>}
        {attempt?.review ? (
          <ReviewPanel review={attempt.review} onOpenOriginal={openOriginal} />
        ) : (
          busy !== "review" && (
            <div className="p-4 text-sm text-muted">
              Submit your files to get a review here. It checks the three acceptance checks, then
              lists bugs and security gaps, and compares your approach with the original.
            </div>
          )
        )}
      </aside>
    </div>
  );
}

function keyOf(tab: Tab): string {
  return `${tab.kind}:${tab.path}`;
}
