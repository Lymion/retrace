"use client";

import { useEffect, useRef, useState } from "react";
import type { Selection } from "@/components/CodeViewer";
import { Markdown } from "@/components/Markdown";
import { ErrorState, Spinner } from "@/components/states";
import type { LevelView } from "@/features/roadmap/LevelMap";
import { ProviderErrorActions } from "@/features/settings/ProviderErrorActions";
import { errorMessage } from "@/lib/api-client";
import { streamPost } from "@/lib/stream-client";
import { useFetch } from "@/lib/use-fetch";
import { PANEL_WIDTH, panelHeight, type usePanelPlacement } from "./usePanelPlacement";

// The tutor: always knows the open file, the current level and the learner
// profile (the server adds the profile). Replies stream in as they are written.

interface ChatMessage {
  id: number | string;
  role: "user" | "assistant";
  kind: "chat" | "lesson";
  content: string;
  levelNumber?: number | null;
}

type Pending = { kind: "chat" | "lesson"; text: string; levelNumber: number | null };

export function TutorPanel({
  projectId,
  level,
  file,
  selection,
  filePaths,
  onOpenFile,
  panel,
}: {
  projectId: number;
  level: LevelView | null;
  file: { id: number; path: string } | null;
  selection: Selection | null;
  filePaths: Set<string>;
  onOpenFile: (path: string, line: number | null) => void;
  panel: ReturnType<typeof usePanelPlacement>;
}) {
  const history = useFetch<{ messages: ChatMessage[] }>(`/api/projects/${projectId}/messages`);
  const [added, setAdded] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<{ error: Error; retry: () => void } | null>(null);
  const [draft, setDraft] = useState("");
  const abort = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const { placement, update, startDrag, moveDrag, endDrag, keyMove, toggleFloating } = panel;

  const messages = [...(history.data?.messages ?? []), ...added];
  const busy = pending !== null;

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages.length, pending?.text]);

  async function run(kind: Pending["kind"], url: string, body: unknown, userText: string | null) {
    setError(null);
    const levelNumber = level?.number ?? null;
    if (userText)
      setAdded((list) => [
        ...list,
        { id: `u${Date.now()}`, role: "user", kind, content: userText, levelNumber },
      ]);
    setPending({ kind, text: "", levelNumber });
    abort.current = new AbortController();
    const retry = () => void run(kind, url, body, null);
    try {
      const reply = await streamPost(
        url,
        body,
        (text) => setPending({ kind, text, levelNumber }),
        abort.current.signal,
      );
      setAdded((list) => [
        ...list,
        { id: `a${Date.now()}`, role: "assistant", kind, content: reply, levelNumber },
      ]);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError({ error: err instanceof Error ? err : new Error(errorMessage(err)), retry });
      }
    } finally {
      setPending(null);
      abort.current = null;
    }
  }

  function send(text: string, withSelection = false) {
    const message = text.trim();
    if (!message || busy) return;
    void run(
      "chat",
      "/api/chat",
      {
        projectId,
        levelId: level?.id ?? null,
        fileId: file?.id ?? null,
        message,
        selection:
          withSelection && selection
            ? { startLine: selection.startLine, endLine: selection.endLine }
            : null,
      },
      message,
    );
  }

  function explainSelection() {
    if (!selection || !file) return;
    send(
      `Explain lines ${selection.startLine}-${selection.endLine} of \`${file.path}\`:\n\n\`\`\`\n${selection.text.slice(0, 1500)}\n\`\`\``,
      true,
    );
  }

  // A lesson already written for this level is shown again for free; only
  // "regenerate" asks the tutor to write a new one.
  const hasLesson =
    level !== null && messages.some((m) => m.kind === "lesson" && m.levelNumber === level.number);

  function teachLevel(regenerate = false) {
    if (!level || busy) return;
    void run(
      "lesson",
      `/api/projects/${projectId}/levels/${level.id}/lesson`,
      regenerate ? { regenerate: true } : {},
      null,
    );
  }

  // ---- collapsed states
  if (placement.collapsed) {
    return (
      <button
        type="button"
        onClick={() => update({ collapsed: false })}
        className={
          placement.floating
            ? "btn btn-primary fixed right-6 bottom-12 z-40 border-ok bg-surface shadow-lg"
            : "flex h-full w-full items-start justify-center pt-3 text-sm text-muted hover:text-text"
        }
        aria-label="Open the tutor"
      >
        {placement.floating ? "Tutor" : <span className="[writing-mode:vertical-rl]">Tutor ◂</span>}
      </button>
    );
  }

  const floatingStyle = placement.floating
    ? { left: placement.x, top: placement.y, width: PANEL_WIDTH, height: panelHeight() }
    : undefined;

  return (
    <section
      aria-label="Tutor"
      style={floatingStyle}
      className={`flex min-h-0 flex-col bg-surface ${
        placement.floating ? "fixed z-40 rounded-lg border border-border shadow-2xl" : "h-full"
      }`}
    >
      <header
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        className={`flex items-center gap-2 border-b border-border px-3 py-2 ${placement.floating ? "cursor-move" : ""}`}
      >
        <h2 className="text-sm font-semibold">Tutor</h2>
        {placement.floating && (
          <button
            type="button"
            className="sr-only focus:not-sr-only focus:text-xs"
            onKeyDown={keyMove}
            aria-label="Move the tutor panel with the arrow keys"
          >
            move
          </button>
        )}
        <div className="ml-auto flex gap-1">
          <button
            type="button"
            className="btn btn-ghost px-2 py-0.5 text-xs"
            onClick={toggleFloating}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {placement.floating ? "Dock" : "Float"}
          </button>
          <button
            type="button"
            className="btn btn-ghost px-2 py-0.5 text-xs"
            onClick={() => update({ collapsed: true })}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Collapse the tutor"
          >
            –
          </button>
        </div>
      </header>

      <div
        className="flex flex-wrap gap-1 border-b border-border px-3 py-1.5"
        aria-label="What the tutor can see"
      >
        {level ? (
          <span className="chip">
            Level {level.number}: {level.name}
          </span>
        ) : (
          <span className="chip">No level</span>
        )}
        {file && <span className="chip max-w-full truncate font-mono">{file.path}</span>}
        {selection && (
          <span className="chip text-accent">
            Lines {selection.startLine}-{selection.endLine} selected
          </span>
        )}
      </div>

      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        className="min-h-0 flex-1 space-y-3 overflow-auto px-3 py-3"
      >
        {history.loading && <Spinner label="Loading the conversation…" />}
        {history.error && <ErrorState message={history.error} onRetry={history.reload} />}
        {!history.loading && messages.length === 0 && !pending && (
          <div className="text-sm text-muted">
            <p>
              Ask anything about this project, or start with a guided tour of the current level.
            </p>
            <p className="mt-2">You can write in English, Malay or both.</p>
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} filePaths={filePaths} onOpenFile={onOpenFile} />
        ))}
        {pending && (
          <div className="border-l-2 border-keyword/50 pl-3">
            {pending.kind === "lesson" && (
              <p className="mb-1 text-xs text-comment"># lesson · level {pending.levelNumber}</p>
            )}
            {pending.text ? (
              <Markdown filePaths={filePaths} onOpenFile={onOpenFile}>
                {pending.text}
              </Markdown>
            ) : (
              <Spinner label={pending.kind === "lesson" ? "Preparing the lesson…" : "Thinking…"} />
            )}
          </div>
        )}
        {error && (
          <ErrorState message={error.error.message} onRetry={error.retry}>
            <ProviderErrorActions error={error.error} onSwitched={error.retry} />
          </ErrorState>
        )}
      </div>

      <div className="space-y-2 border-t border-border p-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn text-xs"
            onClick={() => teachLevel()}
            disabled={!level || busy}
            title={hasLesson ? "Shows the lesson already written, with no new tokens" : undefined}
          >
            {level?.skipped ? "Teach this missing level" : "Tour this level"}
          </button>
          {hasLesson && (
            <button
              type="button"
              className="btn btn-ghost text-xs"
              onClick={() => teachLevel(true)}
              disabled={busy}
              title="Ask the tutor to write this level's lesson again (uses tokens)"
            >
              regenerate
            </button>
          )}
          <button
            type="button"
            className="btn text-xs"
            onClick={explainSelection}
            disabled={!selection || !file || busy}
            title={selection ? undefined : "Select some lines in the code first"}
          >
            Explain this selection
          </button>
          {busy && (
            <button
              type="button"
              className="btn btn-ghost ml-auto text-xs"
              onClick={() => abort.current?.abort()}
            >
              Stop
            </button>
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
            setDraft("");
          }}
          className="flex items-end gap-2"
        >
          <span aria-hidden className="glow self-start pt-1.5 font-bold text-ok">
            ❯
          </span>
          <label htmlFor="tutor-input" className="sr-only">
            Message the tutor
          </label>
          <textarea
            id="tutor-input"
            className="input min-h-[2.5rem] resize-none"
            rows={2}
            placeholder="ask the tutor… (Enter sends, Shift+Enter adds a line)"
            value={draft}
            maxLength={4000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(draft);
                setDraft("");
              }
            }}
          />
          <button type="submit" className="btn btn-primary" disabled={busy || !draft.trim()}>
            Send
          </button>
        </form>
      </div>
    </section>
  );
}

function MessageBubble({
  message,
  filePaths,
  onOpenFile,
}: {
  message: ChatMessage;
  filePaths: Set<string>;
  onOpenFile: (path: string, line: number | null) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex gap-2 text-sm">
        <span aria-hidden className="shrink-0 font-bold text-ok">
          ❯
        </span>
        <p className="min-w-0 whitespace-pre-wrap text-bright">
          <span className="sr-only">You: </span>
          {message.content}
        </p>
      </div>
    );
  }
  return (
    <div className="border-l-2 border-keyword/50 pl-3">
      {message.kind === "lesson" && (
        <p className="mb-1 text-xs text-comment"># lesson · level {message.levelNumber ?? "?"}</p>
      )}
      <Markdown filePaths={filePaths} onOpenFile={onOpenFile}>
        {message.content}
      </Markdown>
    </div>
  );
}
