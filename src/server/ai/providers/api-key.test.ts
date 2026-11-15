import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import type { AIRequest } from "../provider";
import type { UsageReport } from "../usage";
import { type MessagesClient, buildParams, createApiKeyProvider } from "./api-key";

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
    usage: { input_tokens: 50, output_tokens: 7, cache_read_input_tokens: 2000 },
  }));
  const stream = vi.fn(async function* () {
    yield {
      type: "message_start",
      message: { usage: { input_tokens: 30, output_tokens: 1, cache_creation_input_tokens: 1800 } },
    };
    yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hel" } };
    yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "lo" } };
    yield { type: "message_delta", usage: { output_tokens: 2 } };
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

describe("api-key usage reporting", () => {
  it("reports the token counts of a finished call", async () => {
    const reports: UsageReport[] = [];
    const provider = createApiKeyProvider({
      getKey: () => "k",
      makeClient: () => fakeClient(),
      onUsage: (r) => reports.push(r),
    });
    await provider.complete(request);
    expect(reports).toEqual([
      {
        task: "chat",
        provider: "api-key",
        model: "claude-sonnet-5-5",
        inputTokens: 50,
        outputTokens: 7,
        cacheReadTokens: 2000,
        cacheWriteTokens: 0,
      },
    ]);
  });

  it("reports a streamed call, with output from the final delta", async () => {
    const reports: UsageReport[] = [];
    const provider = createApiKeyProvider({
      getKey: () => "k",
      makeClient: () => fakeClient(),
      onUsage: (r) => reports.push(r),
    });
    for await (const _ of provider.stream(request)) void _;
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ inputTokens: 30, outputTokens: 2, cacheWriteTokens: 1800 });
  });

  it("still reports when the learner stops the answer early", async () => {
    const reports: UsageReport[] = [];
    const provider = createApiKeyProvider({
      getKey: () => "k",
      makeClient: () => fakeClient(),
      onUsage: (r) => reports.push(r),
    });
    for await (const chunk of provider.stream(request)) {
      expect(chunk).toBe("Hel");
      break; // like the stop button: the generator is closed mid-stream
    }
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ inputTokens: 30, outputTokens: 1 });
  });
});

describe("buildParams caching", () => {
  const chat: AIRequest = {
    ...request,
    stableContext: '## Open file\n<file path="a.js">...</file>',
    context: "# Task: chat",
    cache: true,
    messages: [
      { role: "user", content: "first question" },
      { role: "assistant", content: "first answer" },
      { role: "user", content: "second question" },
    ],
  };

  it("caches up to the stable block and the last earlier message", () => {
    const params = buildParams(chat);
    const system = params.system as Anthropic.TextBlockParam[];
    expect(system.map((b) => b.text)).toEqual([
      "You are Retrace.",
      "# Project: todo",
      chat.stableContext,
      "# Task: chat",
    ]);
    expect(system.map((b) => b.cache_control ?? null)).toEqual([
      null,
      null,
      { type: "ephemeral" },
      null,
    ]);
    expect(params.messages[1]!.content).toEqual([
      { type: "text", text: "first answer", cache_control: { type: "ephemeral" } },
    ]);
    expect(params.messages[2]!.content).toBe("second question");
  });

  it("leaves one-shot requests uncached apart from the fact sheet", () => {
    const params = buildParams({ ...chat, cache: false });
    const system = params.system as Anthropic.TextBlockParam[];
    expect(system.map((b) => b.text)).toEqual([
      "You are Retrace.",
      "# Project: todo",
      `${chat.stableContext}\n\n# Task: chat`,
    ]);
    expect(system[1]!.cache_control).toEqual({ type: "ephemeral" });
    expect(params.messages.every((m) => typeof m.content === "string")).toBe(true);
  });
});
