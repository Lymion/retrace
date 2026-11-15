"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The main navigation, drawn like tmux's window list: 0:projects* 1:progress.
// Each tab has its own colour; the active one inverts in it.

const NAV = [
  { href: "/", label: "projects", role: "c-accent" },
  { href: "/progress", label: "progress", role: "c-keyword" },
  { href: "/settings", label: "settings", role: "c-number" },
];

function isActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/projects");
  return pathname.startsWith(href);
}

export function NavTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="app-no-drag flex min-w-0 gap-1 overflow-x-auto text-sm">
      {NAV.map((item, i) => {
        const active = isActive(item.href, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`tab ${item.role}`}
          >
            <span aria-hidden className={`hidden sm:inline ${active ? "" : "text-comment"}`}>
              {i}:
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
