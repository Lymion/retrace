import { describe, expect, it } from "vitest";
import { TokenBucket } from "./rate-limit";

describe("TokenBucket", () => {
  it("allows a burst up to capacity, then refills over a minute", () => {
    let now = 0;
    const bucket = new TokenBucket(3, () => now);
    expect([bucket.take(), bucket.take(), bucket.take(), bucket.take()]).toEqual([
      true,
      true,
      true,
      false,
    ]);
    now += 20_000; // a third of a minute refills one token
    expect(bucket.take()).toBe(true);
    expect(bucket.take()).toBe(false);
  });
});
