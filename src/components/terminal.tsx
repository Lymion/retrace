import Link from "next/link";
import { Fragment, type ReactNode, useId } from "react";

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

export type Role = "accent" | "keyword" | "number" | "cyan" | "warn" | "danger" | "ok";

/**
 * A pane: a square box with its title set into the top border, like a TUI
 * window. `role` sets its colour (title, focused border, primary buttons).
 */
export function Pane({
  title,
  note,
  role = "keyword",
  on = false,
  as: Tag = "section",
  headingLevel = 2,
  className = "",
  labelledBy,
  children,
}: {
  title: ReactNode;
  note?: ReactNode;
  role?: Role;
  /** Draw the border in the role colour (the pane with focus, or the main action). */
  on?: boolean;
  as?: "section" | "aside" | "div" | "nav";
  headingLevel?: 2 | 3;
  className?: string;
  /** Override the heading id, when something else needs to point at it. */
  labelledBy?: string;
  children: ReactNode;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const auto = useId();
  const id = labelledBy ?? auto;
  return (
    <Tag
      className={`pane c-${role} ${on ? "pane-on" : ""} ${className}`}
      aria-labelledby={Tag === "div" ? undefined : id}
    >
      <Heading id={id} className="pane-title">
        {title}
      </Heading>
      {note && <span className="pane-note">{note}</span>}
      {children}
    </Tag>
  );
}

/** The ❯ prompt line used as a section lead-in: ❯ ls -l projects/ */
export function PromptLine({ command, flags }: { command: string; flags?: string }) {
  return (
    <p aria-hidden className="truncate text-bright">
      <span className="text-keyword">❯ </span>
      {command}
      {flags && <span className="text-cyan"> {flags}</span>}
    </p>
  );
}
