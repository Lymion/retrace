import type { ReactNode } from "react";

// Loading, empty and error states. Every screen uses these so they look and
// behave the same, including for screen readers.

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-muted">
      <span
        aria-hidden
        className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-accent"
      />
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
    <div className="rounded-lg border border-dashed border-border p-6 text-center">
      <p className="font-medium">{title}</p>
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
    <div role="alert" className="rounded-lg border border-danger/50 bg-danger/10 p-4 text-sm">
      <p className="text-danger">{message}</p>
      {children}
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn mt-2">
          Try again
        </button>
      )}
    </div>
  );
}
