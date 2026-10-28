"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The main navigation, drawn like tmux's window list: 0:projects* 1:progress.

const NAV = [
  { href: "/", label: "projects" },
  { href: "/progress", label: "progress" },
  { href: "/settings", label: "settings" },
];

function isActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/projects");
  return pathname.startsWith(href);
}

export function NavTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex min-w-0 gap-0.5 overflow-x-auto text-sm sm:gap-1">
      {NAV.map((item, i) => {
        const active = isActive(item.href, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-sm px-1.5 py-0.5 whitespace-nowrap sm:px-2 ${
              active ? "glow bg-surface-2 text-ok" : "text-muted hover:text-text"
            }`}
          >
            <span aria-hidden className={`hidden sm:inline ${active ? "text-ok" : "text-comment"}`}>
              {i}:
            </span>
            {item.label}
            <span aria-hidden className="inline-block w-[1ch]">
              {active ? "*" : ""}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
