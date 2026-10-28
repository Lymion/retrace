"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div role="alert" className="mx-auto max-w-xl p-10 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-muted">
        {error.message || "The page could not load."} The details are in the terminal running
        Retrace.
      </p>
      <button type="button" className="btn mt-4" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
