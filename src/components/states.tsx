import type { ReactNode } from "react";

// Loading, empty and error states. Every screen uses these so they look and
// behave the same, including for screen readers. They read like CLI output:
// a braille spinner, "(empty)" and "error:".

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span role="status" className="spinner inline-flex items-baseline gap-2 text-sm text-muted">
      {label}
    </span>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <Spinner label={label} />
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-sm border border-dashed border-border p-6 text-center">
      <p className="font-medium text-bright">
        <span aria-hidden className="text-comment">
          {"-- "}
        </span>
        {title}
        <span aria-hidden className="text-comment">
          {" --"}
        </span>
      </p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  children,
}: {
  message: string;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="rounded-sm border border-danger/40 border-l-2 border-l-danger bg-danger/10 p-3 text-sm"
    >
      <p className="text-danger">
        <span aria-hidden className="font-bold">
          {"✗ error: "}
        </span>
        {message}
      </p>
      {children}
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn mt-2">
          Try again
        </button>
      )}
    </div>
  );
}
