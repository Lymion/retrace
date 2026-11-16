"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorState, Spinner } from "@/components/states";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { useFetch } from "@/lib/use-fetch";

interface ProviderStatus {
  id: "api-key" | "claude-login";
  label: string;
  ready: boolean;
  detail: string;
  fix?: string;
}

const DESCRIPTION: Record<ProviderStatus["id"], string> = {
  "api-key": "Anthropic API with ANTHROPIC_API_KEY from .env. Billed per token on the API.",
  "claude-login":
    "Claude Code (bundled with the official Agent SDK), signed in with your own Claude login. Uses your Claude plan's usage limits.",
};

export function ProviderPanel() {
  const router = useRouter();
  const [fresh, setFresh] = useState(0);
  const { data, error, loading, reload } = useFetch<{
    active: ProviderStatus["id"];
    providers: ProviderStatus[];
  }>(`/api/providers${fresh ? `?fresh=1&n=${fresh}` : ""}`);
  const [switching, setSwitching] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function choose(id: ProviderStatus["id"]) {
    setSwitching(id);
    setProblem(null);
    try {
      await apiFetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeProvider: id }),
      });
      reload();
      router.refresh(); // updates the top-bar indicator
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setSwitching(null);
    }
  }

  return (
    <section
      id="provider"
      aria-labelledby="provider-heading"
      className="card c-accent space-y-4 p-5"
    >
      <div className="flex items-center gap-3">
        <h2 id="provider-heading" className="mr-auto text-lg font-semibold">
          AI provider
        </h2>
        <button
          type="button"
          className="btn"
          onClick={() => setFresh((n) => n + 1)}
          disabled={loading}
        >
          Check again
        </button>
      </div>
      <p className="text-sm text-muted">
        Switch any time. Projects, levels, notes, chat history and your profile stay the same; only
        who answers the next request changes.
      </p>

      {loading && <Spinner label="Checking providers…" />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {problem && <ErrorState message={problem} />}

      {data && (
        <fieldset className="space-y-3">
          <legend className="sr-only">Active AI provider</legend>
          {data.providers.map((provider) => {
            const active = data.active === provider.id;
            return (
              <label
                key={provider.id}
                className={`flex gap-3 rounded-lg border p-4 ${
                  active ? "border-accent bg-accent/5" : "border-border"
                } ${provider.ready ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}
              >
                <input
                  type="radio"
                  name="provider"
                  className="mt-1"
                  checked={active}
                  disabled={!provider.ready || switching !== null}
                  onChange={() => choose(provider.id)}
                />
                <span className="flex-1 text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    {provider.label}
                    {active && <span className="chip text-accent">active</span>}
                    <span className={`chip ${provider.ready ? "text-ok" : "text-warn"}`}>
                      {provider.ready ? "ready" : "not ready"}
                    </span>
                  </span>
                  <span className="mt-1 block text-muted">{DESCRIPTION[provider.id]}</span>
                  <span className="mt-1 block">{provider.detail}</span>
                  {!provider.ready && provider.fix && (
                    <span className="mt-1 block text-warn">Fix: {provider.fix}</span>
                  )}
                </span>
              </label>
            );
          })}
        </fieldset>
      )}

      <p className="rounded-md border border-warn/40 bg-warn/5 p-3 text-xs">
        <strong>Personal use only.</strong> Claude login is for your own use on your own computer.
        Anthropic does not allow third-party apps to offer Claude login to other people, and its
        rules on this changed more than once in 2026. A shared or hosted copy of Retrace must use
        the API key provider only.
      </p>
    </section>
  );
}
