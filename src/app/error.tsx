"use client";

import { Prompt } from "@/components/terminal";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div role="alert" className="mx-auto w-full max-w-2xl space-y-3 p-4 sm:p-10">
      <Prompt decorative cursor={false} />
      <h1 className="font-bold text-danger">
        <span aria-hidden>✗ </span>Something went wrong
      </h1>
      <p className="text-sm text-muted">
        {error.message || "The page could not load."} The details are in the terminal running
        Retrace.
      </p>
      <button type="button" className="btn" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
