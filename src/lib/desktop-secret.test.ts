import { describe, expect, it } from "vitest";
import { DESKTOP_COOKIE, desktopRequestAllowed } from "./desktop-secret";

describe("desktop secret", () => {
  it("allows everything when no secret is set (browser development)", () => {
    expect(desktopRequestAllowed(null, undefined)).toBe(true);
  });

  it("requires the exact secret cookie when one is set", () => {
    const secret = "a".repeat(64);
    expect(desktopRequestAllowed(null, secret)).toBe(false);
    expect(desktopRequestAllowed(`${DESKTOP_COOKIE}=wrong`, secret)).toBe(false);
    expect(desktopRequestAllowed(`${DESKTOP_COOKIE}=${"b".repeat(64)}`, secret)).toBe(false);
    expect(desktopRequestAllowed(`other=1; ${DESKTOP_COOKIE}=${secret}`, secret)).toBe(true);
  });
});
