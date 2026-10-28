"use client";

import { ApiError } from "@/lib/api-client";

// Shown under an AI error. Phase 5 adds a one-click switch to the other
// provider here; until then it points the learner at Settings.

export function ProviderErrorActions({ error }: { error: Error; onSwitched?: () => void }) {
  if (!(error instanceof ApiError) || !error.code?.startsWith("ai_")) return null;
  return (
    <p className="mt-2 text-muted">
      Check the AI provider in{" "}
      <a href="/settings" className="text-accent underline">
        Settings
      </a>
      .
    </p>
  );
}
