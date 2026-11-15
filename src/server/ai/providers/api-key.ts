import Anthropic from "@anthropic-ai/sdk";
import { AIError, type AIProvider, type AIRequest, type ProviderStatus } from "../provider";
import { type RawUsage, type UsageReport, toReport } from "../usage";

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
  /** Called once per finished call with its token counts. */
  onUsage?: (report: UsageReport) => void;
  makeClient?: (apiKey: string) => MessagesClient;
}

const EPHEMERAL = { type: "ephemeral" } as const;
const PARAGRAPH = "\n\n";

export function buildParams(request: AIRequest): Anthropic.MessageCreateParamsNonStreaming {
  const system: Anthropic.TextBlockParam[] = [{ type: "text", text: request.system }];
  if (request.cachedContext) system.push({ type: "text", text: request.cachedContext });
  const stable = request.cache && request.stableContext ? request.stableContext : undefined;
  if (stable) system.push({ type: "text", text: stable });
  // Everything up to and including the marked block is cached for a few
  // minutes. The mark goes on the last block that repeats between requests.
  if (system.length > 1) system[system.length - 1]!.cache_control = EPHEMERAL;
  const rest = [stable ? undefined : request.stableContext, request.context]
    .filter(Boolean)
    .join(PARAGRAPH);
  if (rest) system.push({ type: "text", text: rest });

  const messages: Anthropic.MessageParam[] = request.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  // In a conversation, also mark the last earlier message, so the next turn
  // reuses the whole history and only pays in full for the new question.
  const earlier = messages[messages.length - 2];
  if (request.cache && earlier && typeof earlier.content === "string") {
    earlier.content = [{ type: "text", text: earlier.content, cache_control: EPHEMERAL }];
  }
  return { model: request.model, max_tokens: request.maxTokens, system, messages };
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
    deps.makeClient ??
    ((apiKey: string) =>
      new Anthropic({
        apiKey,
        maxRetries: 2,
        // Pinned, so an inherited ANTHROPIC_BASE_URL can never send the key elsewhere.
        baseURL: "https://api.anthropic.com",
      }));

  const client = (): MessagesClient => {
    const key = deps.getKey();
    if (!key) throw new AIError("not_ready", "No ANTHROPIC_API_KEY in .env.", "api-key");
    return makeClient(key);
  };

  const report = (request: AIRequest, usage: RawUsage | null | undefined) =>
    deps.onUsage?.(
      toReport({ task: request.task, provider: "api-key", model: request.model }, usage),
    );

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
        report(request, message.usage);
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
        const usage: RawUsage = {};
        try {
          for await (const event of client().messages.stream(buildParams(request), { signal })) {
            if (event.type === "message_start") Object.assign(usage, event.message.usage);
            else if (event.type === "message_delta")
              usage.output_tokens = event.usage.output_tokens;
            else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              yield event.delta.text;
            }
          }
        } finally {
          // Also runs when the learner stops the answer early: those tokens were still used.
          if (usage.input_tokens !== undefined) report(request, usage);
        }
      } catch (error) {
        throw friendlyError(error);
      }
    },
  };
}
