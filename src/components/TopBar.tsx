import Link from "next/link";

const NAV = [
  { href: "/", label: "Projects" },
  { href: "/progress", label: "Progress" },
  { href: "/settings", label: "Settings" },
];

export function TopBar() {
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
      <div id="provider-indicator" className="ml-auto text-xs text-muted" />
    </header>
  );
}
