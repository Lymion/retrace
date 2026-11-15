import { existsSync, readdirSync } from "node:fs";
import type { Options, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AIRequest } from "../provider";
import type { UsageReport } from "../usage";
import {
  BLOCKED_TOOLS,
  type QueryFn,
  childEnv,
  createClaudeLoginProvider,
  toPrompt,
} from "./claude-login";

const request: AIRequest = {
  task: "chat",
  model: "claude-sonnet-5-5",
  system: "You are Retrace.",
  cachedContext: "# Project: todo",
  context: "## Open file",
  messages: [{ role: "user", content: "Explain line 3" }],
  maxTokens: 500,
};

const success = (result: string) =>
  ({ type: "result", subtype: "success", is_error: false, result }) as unknown as SDKMessage;
const delta = (text: string) =>
  ({
    type: "stream_event",
    event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
  }) as unknown as SDKMessage;

/** A fake query() that records its options and replays messages. */
function fakeQuery(messages: SDKMessage[], account?: Record<string, string>) {
  const calls: { prompt: unknown; options: Options; cwdWasEmpty: boolean }[] = [];
  const query: QueryFn = ({ prompt, options }) => {
    calls.push({
      prompt,
      options,
      cwdWasEmpty: Boolean(
        options.cwd && existsSync(options.cwd) && readdirSync(options.cwd).length === 0,
      ),
    });
    return {
      async *[Symbol.asyncIterator]() {
        yield* messages;
      },
      accountInfo: async () => account ?? {},
      close: vi.fn(),
    };
  };
  return { query, calls };
}

afterEach(() => vi.unstubAllEnvs());

describe("claude-login lockdown", () => {
  it("runs with no tools, one turn, no settings and an empty folder", async () => {
    const { query, calls } = fakeQuery([success("Hi")]);
    await createClaudeLoginProvider({ query }).complete(request);
    const { options, cwdWasEmpty } = calls[0]!;

    expect(options.tools).toEqual([]);
    expect(options.allowedTools).toEqual([]);
    expect(options.disallowedTools).toEqual(
      expect.arrayContaining(["Bash", "Read", "Write", "Edit", "WebFetch"]),
    );
    expect(options.disallowedTools).toEqual(BLOCKED_TOOLS);
    expect(options.maxTurns).toBe(1);
    expect(options.settingSources).toEqual([]);
    expect(options.mcpServers).toEqual({});
    expect(options.skills).toEqual([]);
    expect(options.permissionMode).toBe("dontAsk");
    expect(options.persistSession).toBe(false);
    expect(cwdWasEmpty).toBe(true);
    expect(options.cwd).not.toBe(process.cwd());
    const decision = await options.canUseTool!("Bash", { command: "rm -rf /" }, {
      signal: new AbortController().signal,
    } as Parameters<NonNullable<Options["canUseTool"]>>[2]);
    expect(decision?.behavior).toBe("deny");
  });

  it("never passes an API key, auth token or Claude session to the child process", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-should-never-leak");
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "token-should-never-leak");
    vi.stubEnv("ANTHROPIC_BASE_URL", "https://proxy.example");
    vi.stubEnv("CLAUDE_CODE_MESSAGING_TOKEN", "session-token");
    vi.stubEnv("GITHUB_TOKEN", "ghp_should_never_leak");
    const { query, calls } = fakeQuery([success("Hi")]);
    await createClaudeLoginProvider({ query }).complete(request);

    const env = calls[0]!.options.env!;
    expect(Object.keys(env).filter((k) => /ANTHROPIC|CLAUDE_CODE|GITHUB/.test(k))).toEqual([]);
    expect(JSON.stringify(env)).not.toMatch(/should-never-leak|session-token/);
    expect(env.PATH ?? env.Path).toBeTruthy();
    expect(env.CLAUDE_AGENT_SDK_CLIENT_APP).toBe("retrace/0.1");
  });

  it("keeps the login location and proxy settings", () => {
    const env = childEnv({
      CLAUDE_CONFIG_DIR: "/home/h/.claude",
      HTTPS_PROXY: "http://proxy:8080",
      SECRET: "x",
    });
    expect(env).toMatchObject({
      CLAUDE_CONFIG_DIR: "/home/h/.claude",
      HTTPS_PROXY: "http://proxy:8080",
    });
    expect(env.SECRET).toBeUndefined();
  });

  it("sends the system prompt, summary and context in order", async () => {
    const { query, calls } = fakeQuery([success("Hi")]);
    await createClaudeLoginProvider({ query }).complete(request);
    expect(calls[0]!.options.systemPrompt).toBe(
      "You are Retrace.\n\n# Project: todo\n\n## Open file",
    );
    expect(calls[0]!.options.model).toBe("claude-sonnet-5-5");
    expect(calls[0]!.prompt).toBe("Explain line 3");
  });
});

describe("claude-login replies", () => {
  it("returns the final text, or streams deltas", async () => {
    const { query } = fakeQuery([delta("Hel"), delta("lo"), success("Hello")]);
    const provider = createClaudeLoginProvider({ query });
    await expect(provider.complete(request)).resolves.toBe("Hello");
    const chunks: string[] = [];
    for await (const chunk of provider.stream(request)) chunks.push(chunk);
    expect(chunks).toEqual(["Hel", "lo"]);
  });

  it("turns a login error into a not-ready error with a fix", async () => {
    const { query } = fakeQuery([
      {
        type: "result",
        subtype: "success",
        is_error: true,
        result: "Invalid API key · Please run /login",
      } as unknown as SDKMessage,
    ]);
    await expect(createClaudeLoginProvider({ query }).complete(request)).rejects.toMatchObject({
      code: "not_ready",
      provider: "claude-login",
    });
  });

  it("reports a usage limit as rate limited", async () => {
    const { query } = fakeQuery([
      {
        type: "result",
        subtype: "success",
        is_error: true,
        result: "Claude usage limit reached",
      } as unknown as SDKMessage,
    ]);
    await expect(createClaudeLoginProvider({ query }).complete(request)).rejects.toMatchObject({
      code: "rate_limited",
    });
  });

  it("formats earlier turns into one prompt", () => {
    const prompt = toPrompt({
      ...request,
      messages: [
        { role: "user", content: "What is JWT?" },
        { role: "assistant", content: "A signed token." },
        { role: "user", content: "Faham, terima kasih. Why sign it?" },
      ],
    });
    expect(prompt).toContain("<learner>\nWhat is JWT?\n</learner>");
    expect(prompt).toContain("<tutor>\nA signed token.\n</tutor>");
    expect(prompt.endsWith("Faham, terima kasih. Why sign it?")).toBe(true);
  });
});

describe("claude-login status", () => {
  it("is ready when Claude Code reports a signed-in account", async () => {
    const { query } = fakeQuery([], { tokenSource: "claude.ai", subscriptionType: "pro" });
    const status = await createClaudeLoginProvider({ query }).status();
    expect(status).toMatchObject({ ready: true, id: "claude-login" });
    expect(status.detail).toMatch(/pro plan/);
  });

  it("is not ready, with a one-line fix, when nobody is signed in", async () => {
    const { query } = fakeQuery([], {});
    const status = await createClaudeLoginProvider({ query }).status();
    expect(status.ready).toBe(false);
    expect(status.fix).toMatch(/sign in/);
  });

  it("marks itself not ready after an expired-session failure, until a fresh check passes", async () => {
    const calls: string[] = [];
    let expired = true;
    const query: QueryFn = ({ prompt }) => {
      calls.push(typeof prompt === "string" ? "call" : "status");
      return {
        async *[Symbol.asyncIterator]() {
          if (typeof prompt !== "string") return;
          if (expired)
            throw new Error(
              "Claude Code returned an error result: Failed to authenticate: OAuth session expired",
            );
          yield success("ok");
        },
        accountInfo: async () => ({ tokenSource: "claude.ai" }),
        close: vi.fn(),
      };
    };
    const provider = createClaudeLoginProvider({ query, pingModel: () => "claude-haiku-5-5" });
    expect((await provider.status()).ready).toBe(true);

    const error = await provider.complete(request).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "not_ready" });
    expect((error as Error).message).toMatch(/OAuth session expired/);
    expect((error as Error).message).toMatch(/\/login/);

    const after = await provider.status();
    expect(after.ready).toBe(false);
    expect(after.fix).toMatch(/npx @anthropic-ai\/claude-code/);

    // "Check again" while still expired: the ping fails, still not ready.
    expect((await provider.status(true)).ready).toBe(false);
    // The learner signs in again.
    expired = false;
    const fixed = await provider.status(true);
    expect(fixed.ready).toBe(true);
    expect(fixed.detail).toMatch(/Verified/);
    expect((await provider.status()).ready).toBe(true);
  });

  it("caches the check unless asked for a fresh one", async () => {
    const { query, calls } = fakeQuery([], { tokenSource: "claude.ai" });
    const provider = createClaudeLoginProvider({ query });
    await provider.status();
    await provider.status();
    expect(calls).toHaveLength(1);
    await provider.status(true);
    expect(calls).toHaveLength(2);
  });
});

describe("claude-login usage reporting", () => {
  const start = {
    type: "stream_event",
    event: {
      type: "message_start",
      message: { usage: { input_tokens: 40, cache_read_input_tokens: 900 } },
    },
  } as unknown as SDKMessage;
  const withUsage = {
    type: "result",
    subtype: "success",
    is_error: false,
    result: "Hello",
    usage: { input_tokens: 40, output_tokens: 12, cache_read_input_tokens: 900 },
  } as unknown as SDKMessage;

  it("reports the counts from the result once", async () => {
    const reports: UsageReport[] = [];
    const { query } = fakeQuery([start, delta("Hel"), delta("lo"), withUsage]);
    const provider = createClaudeLoginProvider({ query, onUsage: (r) => reports.push(r) });
    for await (const _ of provider.stream(request)) void _;
    expect(reports).toEqual([
      {
        task: "chat",
        provider: "claude-login",
        model: "claude-sonnet-5-5",
        inputTokens: 40,
        outputTokens: 12,
        cacheReadTokens: 900,
        cacheWriteTokens: 0,
      },
    ]);
  });

  it("reports what it saw when the learner stops early", async () => {
    const reports: UsageReport[] = [];
    const { query } = fakeQuery([start, delta("Hel"), delta("lo"), withUsage]);
    const provider = createClaudeLoginProvider({ query, onUsage: (r) => reports.push(r) });
    for await (const _ of provider.stream(request)) break;
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ inputTokens: 40, cacheReadTokens: 900 });
  });
});
