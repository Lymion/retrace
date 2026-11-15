import Link from "next/link";
import { RunButton } from "@/components/CommandPalette";
import { NavTabs } from "@/components/NavTabs";
import { getSettings } from "@/server/settings";

const PROVIDER_LABEL = { "api-key": "api-key", "claude-login": "claude-login" } as const;

/**
 * The terminal window's title bar: the app name, its tabs, the run button
 * and the provider. In the desktop app it is the real title bar: it drags the
 * window, and the Windows buttons sit in the space kept free on the right.
 */
export function TopBar() {
  // Read on every request, so the indicator changes as soon as the learner switches.
  let active: keyof typeof PROVIDER_LABEL | null = null;
  try {
    active = getSettings().activeProvider;
  } catch {
    active = null;
  }

  return (
    <header className="app-drag titlebar flex h-10 shrink-0 items-center gap-3 border-b border-border bg-surface pl-3 sm:gap-4">
      <Link href="/" className="app-no-drag glow shrink-0 text-sm font-bold">
        <span aria-hidden className="text-number">
          {"❯ "}
        </span>
        <span className="gradient-text">retrace</span>
      </Link>
      <NavTabs />
      <div className="ml-auto flex shrink-0 items-center gap-2 pr-3">
        <RunButton />
        {active && (
          <Link
            href="/settings#provider"
            className="app-no-drag chip shrink-0 hover:border-ok"
            title="The AI provider that answers the next request. Change it in Settings."
          >
            <span aria-hidden className="h-1.5 w-1.5 bg-ok" />
            <span className="sr-only sm:not-sr-only">
              <span className="hidden sm:inline">ai:</span>
              {PROVIDER_LABEL[active]}
            </span>
          </Link>
        )}
      </div>
    </header>
  );
}
