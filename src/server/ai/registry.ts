import { type Db, getDb } from "@/db/client";
import type { ProviderId } from "@/shared/enums";
import { getEnv } from "../env";
import { getSettings } from "../settings";
import { AIError, type AIProvider } from "./provider";
import { createApiKeyProvider } from "./providers/api-key";

// Holds one instance of each provider. The active one is read from the
// settings table on every call, never cached, so a switch in Settings
// applies to the very next request.

type Providers = Record<ProviderId, AIProvider>;

let providers: Providers | undefined;
let override: Partial<Providers> | undefined;

/** Stand-in until the claude-login provider exists. Never falls back to the API key. */
function unavailable(id: ProviderId, label: string): AIProvider {
  const error = () => new AIError("not_ready", `The ${label} provider is not set up yet.`, id);
  return {
    id,
    label,
    status: async () => ({
      id,
      label,
      ready: false,
      detail: "Not available yet.",
      fix: "Use the API key provider for now.",
    }),
    complete: async () => {
      throw error();
    },
    stream: async function* () {
      throw error();
    },
  };
}

function build(): Providers {
  return {
    "api-key": createApiKeyProvider({ getKey: () => getEnv().ANTHROPIC_API_KEY }),
    "claude-login": unavailable("claude-login", "Claude login"),
  };
}

export function getProviders(): Providers {
  providers ??= build();
  return { ...providers, ...override };
}

export function getProvider(id: ProviderId): AIProvider {
  return getProviders()[id];
}

export function getActiveProvider(db: Db = getDb()): AIProvider {
  return getProvider(getSettings(db).activeProvider);
}

/** Tests install fake providers here. Pass undefined to restore the real ones. */
export function setProvidersForTests(fakes: Partial<Providers> | undefined): void {
  override = fakes;
}
