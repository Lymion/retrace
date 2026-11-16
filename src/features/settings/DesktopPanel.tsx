"use client";

import { useState } from "react";
import { ErrorState } from "@/components/states";
import { errorMessage, postJson } from "@/lib/api-client";

// Desktop app only: where Retrace keeps its data, and a button to open it.

export function DesktopPanel({ folder, version }: { folder: string; version: string }) {
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setError(null);
    try {
      await postJson("/api/desktop/data-folder", {});
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section className="card c-keyword space-y-3 p-5" aria-labelledby="desktop-heading">
      <h2 id="desktop-heading" className="text-lg font-semibold">
        Desktop app
      </h2>
      <p className="text-sm">
        Version <span className="text-number">{version}</span>
      </p>
      <p className="text-sm text-muted">
        Your database and <code>.env</code> (API key, GitHub token) live in{" "}
        <code className="break-all text-text">{folder}</code>. Uninstalling Retrace leaves this
        folder alone.
      </p>
      <button type="button" className="btn" onClick={open}>
        open data folder
      </button>
      {error && <ErrorState message={error} />}
    </section>
  );
}
