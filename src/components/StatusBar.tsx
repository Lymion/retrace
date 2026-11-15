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
  // The server renders no time, so the first client render matches it.
  const time = useSyncExternalStore(subscribeClock, readClock, () => "");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const shortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
      if (!shortcut && (event.key !== ":" || isTyping(event.target))) return;
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
      <div className="flex h-7 items-center border-t border-border bg-surface">
        <span
          className={`flex h-full shrink-0 items-center px-2 font-bold ${
            focused ? "bg-ok text-bg" : "bg-accent text-bg"
          }`}
        >
          {focused ? "COMMAND" : "NORMAL"}
        </span>
        <span className="hidden max-w-[40%] shrink-0 truncate px-3 text-accent sm:block">
          {shellPath(pathname, projects)}
        </span>
        <label className="flex h-full min-w-0 flex-1 items-center gap-1.5 border-l border-border px-2">
          <span aria-hidden className="text-ok">
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
            style={{ caretColor: "var(--ok)" }}
          />
        </label>
        {usage && (
          <span
            className="hidden shrink-0 border-l border-border px-3 text-comment sm:block"
            title={`Tokens used today across ${usage.today.calls} AI calls. Details in Settings.`}
          >
            <span className="text-number">{formatTokens(totalTokens(usage.today))}</span> tok today
            {usage.today.calls > 0 && <> · {cachedShare(usage.today)}% cached</>}
          </span>
        )}
        <span className="hidden shrink-0 border-l border-border px-3 text-comment md:block">
          utf-8 · retrace 0.1.0
        </span>
        {time && (
          <span className="shrink-0 border-l border-border bg-surface-2 px-3 text-keyword">
            {time}
          </span>
        )}
      </div>
    </footer>
  );
}
