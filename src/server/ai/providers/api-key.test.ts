import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import type { AIRequest } from "../provider";
import { type MessagesClient, createApiKeyProvider } from "./api-key";

const request: AIRequest = {
  task: "chat",
  model: "claude-sonnet-5-5",
  system: "You are Retrace.",
  cachedContext: "# Project: todo",
  context: "## Current level: 3",
  messages: [{ role: "user", content: "hi" }],
  maxTokens: 500,
};

function fakeClient(overrides: Partial<MessagesClient["messages"]> = {}) {
  const create = vi.fn(async (_params: unknown) => ({
    content: [
      { type: "text", text: "Hello " },
      { type: "text", text: "Haykal" },
    ],
  }));
  const stream = vi.fn(async function* () {
    yield { type: "message_start" };
    yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hel" } };
    yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "lo" } };
    yield { type: "message_stop" };
  });
  return { messages: { create, stream, ...overrides } } as unknown as MessagesClient & {
    messages: { create: typeof create; stream: typeof stream };
  };
}

describe("api-key provider", () => {
  it("is not ready without a key, with a one-line fix", async () => {
    const provider = createApiKeyProvider({ getKey: () => undefined });
    const status = await provider.status();
    expect(status.ready).toBe(false);
    expect(status.fix).toMatch(/ANTHROPIC_API_KEY/);
    await expect(provider.complete(request)).rejects.toMatchObject({ code: "not_ready" });
  });

  it("caches the project summary and keeps the brief's order", async () => {
    const client = fakeClient();
    const provider = createApiKeyProvider({ getKey: () => "k", makeClient: () => client });
    await expect(provider.complete(request)).resolves.toBe("Hello Haykal");

    const params = client.messages.create.mock
      .calls[0]![0] as Anthropic.MessageCreateParamsNonStreaming;
    expect(client.messages.create).toHaveBeenCalledTimes(1);
    const system = params.system as Anthropic.TextBlockParam[];
    expect(system.map((b) => b.text)).toEqual([
      "You are Retrace.",
      "# Project: todo",
      "## Current level: 3",
    ]);
    expect(system[1]!.cache_control).toEqual({ type: "ephemeral" });
    expect(system[2]!.cache_control).toBeUndefined();
    expect(params).toMatchObject({ model: "claude-sonnet-5-5", max_tokens: 500 });
  });

  it("streams text deltas", async () => {
    const provider = createApiKeyProvider({ getKey: () => "k", makeClient: () => fakeClient() });
    const chunks: string[] = [];
    for await (const chunk of provider.stream(request)) chunks.push(chunk);
    expect(chunks.join("")).toBe("Hello");
  });

  it("turns API errors into friendly messages without details", async () => {
    const client = fakeClient({
      create: vi.fn(async () => {
        throw new Anthropic.APIError(
          401,
          { type: "error" },
          "invalid x-api-key sk-ant-SECRET",
          new Headers(),
        );
      }),
    });
    const provider = createApiKeyProvider({ getKey: () => "k", makeClient: () => client });
    const error = await provider.complete(request).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "not_ready", provider: "api-key" });
    expect((error as Error).message).not.toContain("SECRET");
  });
});
