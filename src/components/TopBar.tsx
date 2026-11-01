import Link from "next/link";
import { NavTabs } from "@/components/NavTabs";
import { getSettings } from "@/server/settings";

const PROVIDER_LABEL = { "api-key": "api-key", "claude-login": "claude-login" } as const;

/** The terminal window's title bar: window buttons, the app name and its tabs. */
export function TopBar() {
  // Read on every request, so the indicator changes as soon as the learner switches.
  let active: keyof typeof PROVIDER_LABEL | null = null;
  try {
    active = getSettings().activeProvider;
  } catch {
    active = null;
  }

  return (
    <header className="flex h-10 shrink-0 items-center gap-3 border-b border-border bg-surface px-3 sm:gap-5">
      <span aria-hidden className="hidden gap-1.5 sm:flex">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
      </span>
      <Link href="/" className="glow shrink-0 text-sm font-bold text-ok">
        <span aria-hidden className="text-keyword">
          {"❯ "}
        </span>
        retrace
      </Link>
      <NavTabs />
      {active && (
        <Link
          href="/settings#provider"
          className="chip ml-auto shrink-0 hover:border-ok"
          title="The AI provider that answers the next request. Change it in Settings."
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ok" />
          <span className="sr-only sm:not-sr-only">
            <span className="hidden sm:inline">ai:</span>
            {PROVIDER_LABEL[active]}
          </span>
        </Link>
      )}
    </header>
  );
}
