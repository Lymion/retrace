import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FakeProvider } from "@tests/helpers/fake-provider";
import { extractJson, parseModelJson, runJsonTask } from "./json";
import { AIError, type AIRequest } from "./provider";

const schema = z.object({ answer: z.number() });
const request: AIRequest = {
  task: "test",
  model: "m",
  system: "s",
  messages: [{ role: "user", content: "go" }],
  maxTokens: 100,
};

describe("extractJson", () => {
  it("reads plain JSON, fenced JSON and JSON inside a sentence", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJson('Here you go: {"a":3} hope that helps')).toEqual({ a: 3 });
  });

  it("throws when there is no JSON", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});

describe("parseModelJson", () => {
  it("names the failing field", () => {
    const result = parseModelJson('{"answer":"four"}', schema);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/answer/);
  });

  it("runs the extra check", () => {
    const result = parseModelJson('{"answer":4}', schema, (d) => (d.answer > 3 ? "too big" : null));
    expect(result).toEqual({ ok: false, error: "too big" });
  });
});

describe("runJsonTask", () => {
  it("returns valid output from the first reply", async () => {
    const provider = new FakeProvider("api-key", ['{"answer":42}']);
    await expect(runJsonTask({ provider, request, schema })).resolves.toEqual({ answer: 42 });
    expect(provider.requests).toHaveLength(1);
  });

  it("retries once with the validation error attached", async () => {
    const provider = new FakeProvider("api-key", ['{"answer":"x"}', '{"answer":7}']);
    await expect(runJsonTask({ provider, request, schema })).resolves.toEqual({ answer: 7 });
    expect(provider.requests).toHaveLength(2);
    const retry = provider.requests[1]!;
    expect(retry.messages.at(-2)).toEqual({ role: "assistant", content: '{"answer":"x"}' });
    expect(retry.messages.at(-1)?.content).toMatch(/answer/);
  });

  it("gives up after the second bad reply with a friendly error", async () => {
    const provider = new FakeProvider("claude-login", ["not json", '{"wrong":true}']);
    const error = await runJsonTask({ provider, request, schema }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AIError);
    expect((error as AIError).code).toBe("invalid_output");
    expect((error as AIError).provider).toBe("claude-login");
    expect((error as AIError).message).toMatch(/try again/i);
    expect(provider.requests).toHaveLength(2);
  });
});
