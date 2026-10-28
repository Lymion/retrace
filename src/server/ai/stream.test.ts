import { describe, expect, it } from "vitest";
import { AIError } from "./provider";
import { STREAM_ERROR_MARK, streamText } from "./stream";

async function* chunks(...parts: (string | Error)[]) {
  for (const part of parts) {
    if (part instanceof Error) throw part;
    yield part;
  }
}

describe("streamText", () => {
  it("streams every chunk and reports the full text once done", async () => {
    let saved: string | null = null;
    const response = await streamText(chunks("Hel", "lo ", "Haykal"), {
      onComplete: (t) => (saved = t),
    });
    expect(response.headers.get("content-type")).toMatch(/text\/plain/);
    expect(await response.text()).toBe("Hello Haykal");
    expect(saved).toBe("Hello Haykal");
  });

  it("throws errors that happen before the first chunk, so the route can answer with JSON", async () => {
    const error = new AIError("not_ready", "Sign in again.", "claude-login");
    await expect(streamText(chunks(error))).rejects.toBe(error);
  });

  it("ends with an error marker when the stream fails midway, and saves nothing", async () => {
    let saved = false;
    const response = await streamText(
      chunks("Part one. ", new AIError("rate_limited", "Usage limit reached.", "claude-login")),
      { onComplete: () => (saved = true) },
    );
    const body = await response.text();
    expect(body.startsWith("Part one. ")).toBe(true);
    const payload = JSON.parse(
      body.slice(body.indexOf(STREAM_ERROR_MARK) + STREAM_ERROR_MARK.length),
    );
    expect(payload).toEqual({
      message: "Usage limit reached.",
      code: "ai_rate_limited",
      provider: "claude-login",
    });
    expect(saved).toBe(false);
  });
});
