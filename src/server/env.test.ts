import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("fills in defaults from the brief", () => {
    const env = parseEnv({});
    expect(env.TUTOR_MODEL).toBe("claude-sonnet-5-5");
    expect(env.FAST_MODEL).toBe("claude-haiku-5-5");
    expect(env.MAX_UPLOAD_MB).toBe(50);
    expect(env.MAX_FILES).toBe(5000);
  });

  it("treats a blank key as not set", () => {
    expect(parseEnv({ ANTHROPIC_API_KEY: "  " }).ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("coerces numeric limits", () => {
    expect(parseEnv({ MAX_UPLOAD_MB: "10" }).MAX_UPLOAD_MB).toBe(10);
  });

  it("names the bad variable without echoing its value", () => {
    expect(() => parseEnv({ MAX_FILES: "-3" })).toThrowError(/MAX_FILES/);
    expect(() => parseEnv({ MAX_FILES: "-3" })).not.toThrowError(/-3/);
  });
});
