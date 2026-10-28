import Link from "next/link";
import { getSettings } from "@/server/settings";

const NAV = [
  { href: "/", label: "Projects" },
  { href: "/progress", label: "Progress" },
  { href: "/settings", label: "Settings" },
];

const PROVIDER_LABEL = { "api-key": "API key", "claude-login": "Claude login" } as const;

export function TopBar() {
  // Read on every request, so the indicator changes as soon as the learner switches.
  let active: keyof typeof PROVIDER_LABEL | null = null;
  try {
    active = getSettings().activeProvider;
  } catch {
    active = null;
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-6 border-b border-border bg-surface px-4">
      <Link href="/" className="font-semibold tracking-tight">
        Retrace
      </Link>
      <nav aria-label="Main" className="flex gap-4 text-sm">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className="text-muted hover:text-text">
            {item.label}
          </Link>
        ))}
      </nav>
      {active && (
        <Link
          href="/settings#provider"
          className="chip ml-auto hover:border-accent"
          title="The AI provider that answers the next request. Change it in Settings."
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ok" />
          AI: {PROVIDER_LABEL[active]}
        </Link>
      )}
    </header>
  );
}
