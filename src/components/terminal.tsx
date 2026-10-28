import Link from "next/link";
import { Fragment, type ReactNode } from "react";

// Terminal-style building blocks shared by every screen. The prompt line
// doubles as the breadcrumb: each folder in the path is a link.

export interface Crumb {
  label: string;
  href?: string;
}

export function Cursor() {
  return <span aria-hidden className="cursor" />;
}

/** retrace@local:~/flask-notes/workspace$ ▌ */
export function Prompt({
  path = [],
  command,
  cursor = true,
  decorative = false,
  className = "",
}: {
  path?: Crumb[];
  command?: string;
  cursor?: boolean;
  /** A repeat prompt that only sets the scene: hidden from screen readers, no links. */
  decorative?: boolean;
  className?: string;
}) {
  if (decorative) {
    return (
      <div aria-hidden className={`min-w-0 truncate text-sm ${className}`}>
        <span className="glow font-semibold text-ok">retrace</span>
        <span className="text-comment">@</span>
        <span className="text-cyan">local</span>
        <span className="text-comment">:</span>
        <span className="text-accent">{["~", ...path.map((c) => c.label)].join("/")}</span>
        <span className="text-comment">$</span>
        {command && <span className="text-bright"> {command}</span>}
        {cursor && <Cursor />}
      </div>
    );
  }
  return (
    <div className={`min-w-0 truncate text-sm ${className}`}>
      <span aria-hidden>
        <span className="glow font-semibold text-ok">retrace</span>
        <span className="text-comment">@</span>
        <span className="text-cyan">local</span>
        <span className="text-comment">:</span>
      </span>
      <nav aria-label="Breadcrumb" className="inline text-accent">
        <Link href="/" className="hover:underline" aria-label="Projects">
          ~
        </Link>
        {path.map((crumb, i) => (
          <Fragment key={i}>
            <span aria-hidden>/</span>
            {crumb.href ? (
              <Link href={crumb.href} className="hover:underline">
                {crumb.label}
              </Link>
            ) : (
              <span aria-current="page">{crumb.label}</span>
            )}
          </Fragment>
        ))}
      </nav>
      <span aria-hidden className="text-comment">
        $
      </span>
      {command && <span className="text-bright"> {command}</span>}
      {cursor && <Cursor />}
    </div>
  );
}

/** A screen's header: the prompt, then the title and a // comment as its output. */
export function PageHeader({
  path,
  title,
  children,
  actions,
}: {
  path?: Crumb[];
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="space-y-3">
      <Prompt path={path} />
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto min-w-0">
          <h1 className="glow text-xl font-bold break-words text-bright">{title}</h1>
          {children && (
            <p className="mt-1 text-sm text-muted">
              <span aria-hidden className="text-comment">
                {"// "}
              </span>
              {children}
            </p>
          )}
        </div>
        {actions}
      </div>
    </header>
  );
}

/** "[ ok ]" style status tags, as in a boot log. */
export function StatusTag({ tone, children }: { tone: "ok" | "info" | "warn"; children: string }) {
  const color = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-cyan";
  return (
    <span className={`mr-[1ch] inline-block shrink-0 ${color}`}>
      <span aria-hidden className="text-comment">
        [
      </span>
      <span className="inline-block w-[6ch] text-center">{children}</span>
      <span aria-hidden className="text-comment">
        ]
      </span>
    </span>
  );
}
