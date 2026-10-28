"use client";

import type { ViewerNote } from "@/components/CodeViewer";
import { ErrorState, Spinner } from "@/components/states";
import { ProviderErrorActions } from "@/features/settings/ProviderErrorActions";

// The same notes as the gutter markers, as a list of buttons. This is the
// keyboard and screen-reader way in: Monaco's gutter is mouse-only.

const CATEGORY_STYLE: Record<ViewerNote["category"], string> = {
  concept: "text-concept",
  security: "text-security",
  pattern: "text-pattern",
  gotcha: "text-gotcha",
};

export function NotesPanel({
  notes,
  loading,
  regenerating,
  error,
  openLine,
  onOpen,
  onRetry,
  onRegenerate,
}: {
  notes: ViewerNote[];
  loading: boolean;
  regenerating: boolean;
  error: Error | null;
  openLine: number | null;
  onOpen: (line: number | null) => void;
  onRetry: () => void;
  onRegenerate: () => void;
}) {
  return (
    <section aria-label="Notes on this file" className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs">
        <span className="font-medium">Notes</span>
        <span className="text-muted">{loading ? "" : `${notes.length}`}</span>
        <span className="ml-2 flex gap-2 text-muted" aria-hidden>
          <span className="text-concept">● concept</span>
          <span className="text-security">● security</span>
          <span className="text-pattern">● pattern</span>
          <span className="text-gotcha">● gotcha</span>
        </span>
        <button
          type="button"
          className="btn btn-ghost ml-auto px-2 py-0.5 text-xs"
          onClick={onRegenerate}
          disabled={loading || regenerating}
        >
          {regenerating ? "Rewriting…" : "Rewrite notes"}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 py-2" aria-live="polite">
        {loading && <Spinner label="The tutor is reading this file and writing notes…" />}
        {error && (
          <ErrorState message={error.message} onRetry={onRetry}>
            <ProviderErrorActions error={error} onSwitched={onRetry} />
          </ErrorState>
        )}
        {!loading && !error && notes.length === 0 && (
          <p className="text-sm text-muted">
            No notes for this file. It is short or has nothing new to teach.
          </p>
        )}
        <ul className="space-y-1">
          {notes.map((note) => (
            <li key={note.id}>
              <button
                type="button"
                onClick={() => onOpen(openLine === note.startLine ? null : note.startLine)}
                aria-pressed={openLine === note.startLine}
                className={`w-full rounded px-2 py-1 text-left text-sm hover:bg-surface-2 ${
                  openLine === note.startLine ? "bg-surface-2" : ""
                }`}
              >
                <span className={`font-mono text-xs ${CATEGORY_STYLE[note.category]}`}>
                  L{note.startLine} {note.category}
                </span>{" "}
                <span className="line-clamp-2 block">{note.note}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
