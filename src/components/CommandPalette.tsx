"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { type CommandProject, filterEntries, paletteEntries, runCommand } from "@/lib/commands";

// The command list on Ctrl K: a filter and the places you can go. It opens
// instantly (no animation), because it is used from the keyboard many times
// a day. Enter runs the highlighted entry, Escape closes.

export const PALETTE_EVENT = "retrace:palette";

export function openPalette() {
  window.dispatchEvent(new Event(PALETTE_EVENT));
}

export function CommandPalette() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [projects, setProjects] = useState<CommandProject[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const listId = useId();

  const entries = useMemo(
    () => filterEntries(paletteEntries(pathname, projects), query),
    [pathname, projects, query],
  );

  useEffect(() => {
    function show() {
      returnTo.current = document.activeElement as HTMLElement | null;
      setQuery("");
      setActive(0);
      setOpen(true);
      apiFetch<{ projects: CommandProject[] }>("/api/projects").then(
        (data) => setProjects(data.projects),
        () => {},
      );
    }
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        show();
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(PALETTE_EVENT, show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(PALETTE_EVENT, show);
    };
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function close() {
    setOpen(false);
    returnTo.current?.focus?.();
  }

  function run(index: number) {
    const entry = entries[index];
    if (!entry) return;
    const result = runCommand(entry.input, { pathname, projects });
    setOpen(false);
    if (result.back) router.back();
    else if (result.navigate) router.push(result.navigate);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(active);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (entries.length ? (i + step + entries.length) % entries.length : 0));
    }
  }

  if (!open) return null;
  const activeId = entries[active] ? `${listId}-${active}` : undefined;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 px-4 pt-[12vh]"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Run a command"
        className="c-keyword w-full max-w-[540px] border border-keyword bg-bg shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
      >
        <div className="flex items-center gap-2 border-b border-rule px-3 py-2.5 text-keyword">
          <span aria-hidden>❯</span>
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={activeId}
            aria-label="Run a command"
            placeholder="go to or run…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            onBlur={(event) => {
              // Clicking outside the list closes it; clicking an entry does not.
              if (!event.currentTarget.closest("[role=dialog]")?.contains(event.relatedTarget))
                close();
            }}
            spellCheck={false}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-bright placeholder:text-comment focus:outline-none"
            style={{ caretColor: "var(--keyword)" }}
          />
          <span aria-hidden className="kbd">
            esc
          </span>
        </div>
        <ul
          id={listId}
          role="listbox"
          aria-label="Commands"
          className="max-h-72 overflow-auto p-1.5"
        >
          {entries.length === 0 && (
            <li className="px-2 py-1 text-sm text-comment">
              no match. Press : for the command line.
            </li>
          )}
          {entries.map((entry, i) => (
            <li
              key={`${entry.input}-${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              tabIndex={-1}
              onMouseMove={() => setActive(i)}
              onClick={() => run(i)}
              className={`flex cursor-pointer justify-between gap-3 px-2 py-1 text-sm ${
                i === active ? "bg-keyword text-bg" : "text-text"
              }`}
            >
              <span className="truncate">{entry.label}</span>
              <span className={`shrink-0 text-xs ${i === active ? "text-bg" : "text-comment"}`}>
                {entry.hint}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The visible "run" button in the top bar. */
export function RunButton() {
  return (
    <button
      type="button"
      onClick={openPalette}
      className="app-no-drag flex shrink-0 items-center gap-2 px-2 py-0.5 text-xs text-comment hover:text-keyword"
      title="Go to a project or screen (Ctrl K)"
    >
      <span className="hidden sm:inline">run</span>
      <span className="kbd">Ctrl K</span>
    </button>
  );
}
