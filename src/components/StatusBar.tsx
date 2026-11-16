"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  type CommandProject,
  type OutputLine,
  complete,
  runCommand,
  shellPath,
} from "@/lib/commands";
import { apiFetch } from "@/lib/api-client";
import {
  USAGE_EVENT,
  type UsageSummaryView,
  cachedShare,
  formatTokens,
  totalTokens,
} from "@/lib/tokens";

// The status line at the bottom of the window, like vim's or tmux's, with a
// command line: press ":" anywhere (or click it) and type "help".

/** Announced by a screen to name where the learner is in the status line. */
export const PLACE_EVENT = "retrace:place";

/** The last place announced, for a status line that mounts after the screen. */
let lastPlace: { path: string; label: string } | null = null;

export function announcePlace(label: string) {
  lastPlace = { path: window.location.pathname, label };
  window.dispatchEvent(new CustomEvent(PLACE_EVENT, { detail: label }));
}

function placeFor(pathname: string): string {
  if (pathname === "/") return "home";
  if (pathname.endsWith("/workspace")) return "workspace";
  if (pathname.endsWith("/challenge")) return "remix";
  if (pathname.startsWith("/projects/")) return "project";
  return pathname.slice(1).split("/")[0] ?? "home";
}

const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";

const TONE: Record<NonNullable<OutputLine["tone"]>, string> = {
  muted: "text-muted",
  ok: "text-ok",
  error: "text-danger",
  accent: "text-accent",
};
const MAX_LINES = 60;

/** True when a key press belongs to something the learner is typing in. */
function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    !!target.closest("input, textarea, select, [contenteditable='true'], .monaco-editor")
  );
}

function subscribeClock(onChange: () => void) {
  const timer = setInterval(onChange, 10_000);
  return () => clearInterval(timer);
}
const readClock = () =>
  new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export function StatusBar() {
  const pathname = usePathname();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [value, setValue] = useState("");
  const [lines, setLines] = useState<OutputLine[]>([]);
  const history = useRef<string[]>([]);
  const historyAt = useRef(-1);
  // Names for the path and for Tab completion. Refreshed on every screen
  // change, and a failed refresh keeps the last list.
  const [projects, setProjects] = useState<CommandProject[]>([]);
  // Where the learner is, e.g. "level 3". The workspace announces its level.
  const [place, setPlace] = useState<{ path: string; label: string } | null>(null);
  useEffect(() => {
    const onPlace = () => setPlace(lastPlace);
    onPlace();
    window.addEventListener(PLACE_EVENT, onPlace);
    return () => window.removeEventListener(PLACE_EVENT, onPlace);
  }, []);
  const placeLabel = place && place.path === pathname ? place.label : placeFor(pathname);

  // The server renders no time, so the first client render matches it.
  const time = useSyncExternalStore(subscribeClock, readClock, () => "");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // Ctrl K opens the command list (CommandPalette); ":" opens this line.
      if (event.key !== ":" || isTyping(event.target)) return;
      event.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ projects: CommandProject[] }>("/api/projects").then(
      (data) => !cancelled && setProjects(data.projects),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // Today's token count. Refreshed on every screen change and after each AI call.
  const [usage, setUsage] = useState<UsageSummaryView | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      apiFetch<{ usage: UsageSummaryView }>("/api/usage").then(
        (data) => !cancelled && setUsage(data.usage),
        () => {},
      );
    void load();
    window.addEventListener(USAGE_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(USAGE_EVENT, load);
    };
  }, [pathname]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lines]);

  const print = (next: OutputLine[]) => setLines((prev) => [...prev, ...next].slice(-MAX_LINES));

  function submit() {
    const input = value.trim();
    setValue("");
    historyAt.current = -1;
    if (!input) return;
    history.current = [input, ...history.current.filter((h) => h !== input)].slice(0, 50);
    const result = runCommand(input, { pathname, projects });
    if (result.clear) {
      setLines([]);
      return;
    }
    print([{ text: `❯ ${input}`, tone: "muted" }, ...result.lines]);
    if (result.navigate || result.back) {
      if (result.back) router.back();
      else if (result.navigate) router.push(result.navigate);
      if (result.lines.length === 0) setLines([]);
      inputRef.current?.blur();
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape") {
      setLines([]);
      setValue("");
      event.currentTarget.blur();
    } else if (event.key === "Tab" && value.trim()) {
      event.preventDefault();
      const { value: completed, options } = complete(value, projects);
      setValue(completed);
      if (options.length) print([{ text: options.join("  "), tone: "muted" }]);
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const step = event.key === "ArrowUp" ? 1 : -1;
      const at = Math.min(Math.max(historyAt.current + step, -1), history.current.length - 1);
      historyAt.current = at;
      setValue(at === -1 ? "" : (history.current[at] ?? ""));
    }
  }

  return (
    <footer className="sticky bottom-0 z-50 shrink-0 text-xs">
      {lines.length > 0 && (
        <div className="absolute inset-x-0 bottom-full border-t border-border bg-surface/95 shadow-[0_-8px_24px_rgba(0,0,0,0.45)] backdrop-blur">
          <div
            ref={logRef}
            role="log"
            aria-live="polite"
            aria-label="Command output"
            className="max-h-64 overflow-auto px-3 py-2 whitespace-pre"
          >
            {lines.map((line, i) => (
              <div key={i} className={line.tone ? TONE[line.tone] : "text-text"}>
                {line.text}
              </div>
            ))}
          </div>
        </div>
      )}
      <div
        aria-hidden
        className="hidden gap-x-4 border-t border-border bg-bg px-3 py-0.5 text-comment md:flex"
      >
        {pathname.endsWith("/workspace") && (
          <>
            <span>
              <b className="font-normal text-number">j/k</b> level
            </span>
            <span>
              <b className="font-normal text-number">1-4</b> step
            </span>
          </>
        )}
        <span>
          <b className="font-normal text-number">ctrl+k</b> run
        </span>
        <span>
          <b className="font-normal text-number">:</b> command line
        </span>
        <span>
          <b className="font-normal text-number">esc</b> close
        </span>
      </div>
      <div className="flex h-7 items-stretch overflow-hidden border-t border-border bg-surface whitespace-nowrap">
        <span
          className={`flex shrink-0 items-center px-2 font-bold text-bg ${
            focused ? "bg-number" : "bg-accent"
          }`}
        >
          {focused ? "COMMAND" : "NORMAL"}
        </span>
        <span className="hidden shrink-0 items-center bg-surface-2 px-3 text-keyword sm:flex">
          {placeLabel}
        </span>
        <span className="hidden max-w-[30%] shrink-0 items-center truncate px-3 text-cyan lg:flex">
          {shellPath(pathname, projects)}
        </span>
        <label className="flex min-w-0 flex-1 items-center gap-1.5 border-l border-border px-2">
          <span aria-hidden className="text-number">
            {focused ? "❯" : ":"}
          </span>
          <span className="sr-only">Command</span>
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="type help, or press : from anywhere"
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            maxLength={200}
            className="cmd-input h-full min-w-0 flex-1 bg-transparent text-text placeholder:text-comment focus:outline-none"
            style={{ caretColor: "var(--number)" }}
          />
        </label>
        {usage && (
          <span
            className="hidden shrink-0 items-center bg-surface-2 px-3 text-muted sm:flex"
            title={`Tokens used today across ${usage.today.calls} AI calls. Details in Settings.`}
          >
            <span className="text-number">{formatTokens(totalTokens(usage.today))}</span>
            &nbsp;tok today
            {usage.today.calls > 0 && <>&nbsp;· {cachedShare(usage.today)}% cached</>}
          </span>
        )}
        <span className="flex shrink-0 items-center bg-number px-2.5 font-bold text-bg">
          v{VERSION}
        </span>
        {time && (
          <span className="hidden shrink-0 items-center px-3 text-keyword sm:flex">{time}</span>
        )}
      </div>
    </footer>
  );
}
