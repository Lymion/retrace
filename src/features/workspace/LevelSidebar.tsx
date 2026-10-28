"use client";

import { FileTree, type TreeFile } from "@/components/FileTree";
import type { LevelView } from "@/features/roadmap/LevelMap";
import type { WorkspaceFile } from "./types";

// Left pane: the levels in build order, and the files of the current one.
// In Rebuild mode later levels are dimmed (and their files hidden elsewhere).

export function LevelSidebar({
  levels,
  files,
  levelId,
  fileId,
  dimAfter,
  showAll,
  onShowAll,
  onLevel,
  onFile,
}: {
  levels: LevelView[];
  files: WorkspaceFile[];
  levelId: number | null;
  fileId: number | null;
  /** Level number after which everything is dimmed (Rebuild mode). */
  dimAfter: number | null;
  showAll: boolean;
  onShowAll: (value: boolean) => void;
  onLevel: (id: number) => void;
  onFile: (id: number) => void;
}) {
  const current = levels.find((l) => l.id === levelId);
  const visible: TreeFile[] = (
    showAll || !current ? files : files.filter((f) => f.levelId === levelId)
  ).map((f) => {
    const level = levels.find((l) => l.id === f.levelId);
    return {
      id: f.id,
      path: f.path,
      dimmed: dimAfter !== null && (level?.number ?? 0) > dimAfter,
      badge: showAll && level ? `L${level.number}` : undefined,
    };
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      {levels.length > 0 && (
        <nav
          aria-label="Levels"
          className="max-h-[45%] shrink-0 overflow-auto border-b border-border p-2"
        >
          <ol className="space-y-0.5">
            {levels.map((level) => {
              const active = level.id === levelId;
              const dimmed = dimAfter !== null && level.number > dimAfter;
              return (
                <li key={level.id}>
                  <button
                    type="button"
                    onClick={() => onLevel(level.id)}
                    aria-current={active ? "step" : undefined}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm ${
                      active ? "bg-accent-strong/25" : "hover:bg-surface-2"
                    } ${dimmed ? "opacity-40" : ""}`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
                        level.status === "done"
                          ? "bg-ok text-bg"
                          : level.skipped
                            ? "border border-dashed border-warn text-warn"
                            : "bg-surface-2"
                      }`}
                    >
                      {level.number}
                    </span>
                    <span className="truncate">{level.name}</span>
                    {level.skipped && <span className="sr-only">(skipped in this project)</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      )}
      <div className="flex items-center gap-2 px-3 pt-2 text-xs text-muted">
        <span className="mr-auto">
          {showAll || !current ? "All files" : `Files in level ${current.number}`}
        </span>
        {current && (
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => onShowAll(e.target.checked)}
            />
            all
          </label>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {visible.length === 0 ? (
          <p className="px-2 text-sm text-muted">
            {current?.skipped
              ? "This project skipped this level, so it has no files. The tutor can still teach it."
              : "No files here."}
          </p>
        ) : (
          <FileTree
            files={visible}
            selectedId={fileId}
            onSelect={(f) => onFile(f.id)}
            label="Level files"
          />
        )}
      </div>
    </div>
  );
}
