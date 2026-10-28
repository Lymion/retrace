import { type Db, getDb } from "@/db/client";
import type { ProviderId } from "@/shared/enums";
import { getEnv } from "../env";
import { getSettings } from "../settings";
import type { AIProvider } from "./provider";
import { createApiKeyProvider } from "./providers/api-key";
import { createClaudeLoginProvider } from "./providers/claude-login";

// Holds one instance of each provider. The active one is read from the
// settings table on every call, never cached, so a switch in Settings
// applies to the very next request.

type Providers = Record<ProviderId, AIProvider>;

let providers: Providers | undefined;
let override: Partial<Providers> | undefined;

function build(): Providers {
  return {
    "api-key": createApiKeyProvider({ getKey: () => getEnv().ANTHROPIC_API_KEY }),
    "claude-login": createClaudeLoginProvider({ pingModel: () => getSettings().fastModel }),
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
