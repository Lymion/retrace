import { describe, expect, it } from "vitest";
import { OUTPUT_CAPS, modelFor, outputCap } from "./models";

const models = { tutorModel: "big", fastModel: "small" };

describe("modelFor", () => {
  it("uses the tutor model for tutor tasks unless economy mode is on", () => {
    expect(modelFor({ ...models, economyMode: false }, "tutor")).toBe("big");
    expect(modelFor({ ...models, economyMode: false }, "fast")).toBe("small");
    expect(modelFor({ ...models, economyMode: true }, "tutor")).toBe("small");
  });
});

describe("outputCap", () => {
  it("scales with depth and never exceeds today's caps", () => {
    expect(outputCap({ depth: "beginner" }, "lesson")).toBe(OUTPUT_CAPS.lesson);
    expect(outputCap({ depth: "advanced" }, "lesson")).toBeLessThan(OUTPUT_CAPS.lesson);
    for (const depth of ["beginner", "intermediate", "advanced"] as const) {
      expect(outputCap({ depth }, "chat")).toBeLessThanOrEqual(OUTPUT_CAPS.chat);
      expect(outputCap({ depth }, "chat")).toBeGreaterThan(500);
    }
  });
});
