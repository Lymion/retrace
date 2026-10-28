"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, apiFetch, errorMessage } from "@/lib/api-client";

// Shown under an AI error: offers a one-click switch to the other provider.
// The learner always chooses; Retrace never switches on its own.

const OTHER: Record<string, { id: string; label: string }> = {
  "api-key": { id: "claude-login", label: "Claude login" },
  "claude-login": { id: "api-key", label: "API key" },
};

export function ProviderErrorActions({
  error,
  onSwitched,
}: {
  error: Error;
  onSwitched?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (!(error instanceof ApiError) || !error.code?.startsWith("ai_")) return null;
  const other = error.provider ? OTHER[error.provider] : undefined;

  async function switchProvider() {
    if (!other) return;
    setBusy(true);
    setProblem(null);
    try {
      await apiFetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeProvider: other.id }),
      });
      router.refresh();
      onSwitched?.();
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {other && (
        <button type="button" className="btn" onClick={switchProvider} disabled={busy}>
          Switch to {other.label} and try again
        </button>
      )}
      <Link href="/settings" className="text-accent underline">
        AI provider settings
      </Link>
      {problem && <p className="w-full text-muted">{problem}</p>}
    </div>
  );
}
