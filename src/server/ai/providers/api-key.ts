import Anthropic from "@anthropic-ai/sdk";
import { AIError, type AIProvider, type AIRequest, type ProviderStatus } from "../provider";

// The "api-key" provider: the official Anthropic SDK with ANTHROPIC_API_KEY
// from .env, billed per token. The project fact sheet gets a cache_control
// marker so repeated requests about the same project reuse it.

/** The part of the SDK client we use, so tests can pass a fake. */
export interface MessagesClient {
  messages: {
    create(
      params: Anthropic.MessageCreateParamsNonStreaming,
      options?: { signal?: AbortSignal },
    ): Promise<Anthropic.Message>;
    stream(
      params: Anthropic.MessageStreamParams,
      options?: { signal?: AbortSignal },
    ): AsyncIterable<Anthropic.MessageStreamEvent>;
  };
}

export interface ApiKeyDeps {
  getKey: () => string | undefined;
  makeClient?: (apiKey: string) => MessagesClient;
}

function buildParams(request: AIRequest): Anthropic.MessageCreateParamsNonStreaming {
  const system: Anthropic.TextBlockParam[] = [{ type: "text", text: request.system }];
  if (request.cachedContext) {
    // Everything up to and including this block is cached for a few minutes.
    system.push({
      type: "text",
      text: request.cachedContext,
      cache_control: { type: "ephemeral" },
    });
  }
  if (request.context) system.push({ type: "text", text: request.context });
  return {
    model: request.model,
    max_tokens: request.maxTokens,
    system,
    messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
  };
}

function friendlyError(error: unknown): AIError {
  if (error instanceof Anthropic.APIError) {
    if (error.status === 401)
      return new AIError(
        "not_ready",
        "The API key in .env was rejected. Check ANTHROPIC_API_KEY.",
        "api-key",
      );
    if (error.status === 429)
      return new AIError(
        "rate_limited",
        "The Anthropic API rate limit was hit. Wait a minute and try again.",
        "api-key",
      );
    if (error.status === 404)
      return new AIError(
        "provider_failed",
        "The model name was not found. Check the model names in Settings.",
        "api-key",
      );
    if (error.status === 529 || error.status === 503) {
      return new AIError(
        "provider_failed",
        "The Anthropic API is busy right now. Try again shortly.",
        "api-key",
      );
    }
    return new AIError(
      "provider_failed",
      `The Anthropic API returned an error (${error.status ?? "network"}).`,
      "api-key",
    );
  }
  if (error instanceof AIError) return error;
  if (error instanceof Error && error.name === "AbortError")
    return new AIError("provider_failed", "The request was cancelled.", "api-key");
  return new AIError(
    "provider_failed",
    "Could not reach the Anthropic API. Check your internet connection.",
    "api-key",
  );
}

export function createApiKeyProvider(deps: ApiKeyDeps): AIProvider {
  const makeClient =
    deps.makeClient ?? ((apiKey: string) => new Anthropic({ apiKey, maxRetries: 2 }));

  const client = (): MessagesClient => {
    const key = deps.getKey();
    if (!key) throw new AIError("not_ready", "No ANTHROPIC_API_KEY in .env.", "api-key");
    return makeClient(key);
  };

  return {
    id: "api-key",
    label: "API key",

    async status(): Promise<ProviderStatus> {
      const ready = Boolean(deps.getKey());
      return ready
        ? {
            id: "api-key",
            label: "API key",
            ready,
            detail: "ANTHROPIC_API_KEY found in .env. Billed per token on the API.",
          }
        : {
            id: "api-key",
            label: "API key",
            ready,
            detail: "No ANTHROPIC_API_KEY in .env.",
            fix: "Add ANTHROPIC_API_KEY=... to .env, then restart Retrace.",
          };
    },

    async complete(request, signal) {
      try {
        const message = await client().messages.create(buildParams(request), { signal });
        return message.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("");
      } catch (error) {
        throw friendlyError(error);
      }
    },

    async *stream(request, signal) {
      try {
        for await (const event of client().messages.stream(buildParams(request), { signal })) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            yield event.delta.text;
          }
        }
      } catch (error) {
        throw friendlyError(error);
      }
    },
  };
}
