import { describe, expect, test } from "bun:test";
import {
  DEFAULT_DESTINATION,
  safePortalDestination,
  safeSetPasswordDestination,
  safeSiteDestination,
} from "./next-destination";

describe("safePortalDestination", () => {
  test("keeps a portal path so a shared deep link survives sign-in", () => {
    expect(safePortalDestination("/portal/events/abc-123")).toBe(
      "/portal/events/abc-123",
    );
    expect(
      safePortalDestination("/portal/finance/expenses?status=submitted"),
    ).toBe("/portal/finance/expenses?status=submitted");
    expect(safePortalDestination("/portal")).toBe("/portal");
  });

  test("falls back when there's nothing to return to", () => {
    expect(safePortalDestination(null)).toBe(DEFAULT_DESTINATION);
    expect(safePortalDestination("")).toBe(DEFAULT_DESTINATION);
  });

  test("refuses anything that would leave the portal", () => {
    // Absolute and protocol-relative URLs would make the login page an open
    // redirect; /home is same-site but outside the portal.
    for (const hostile of [
      "https://evil.example/portal/home",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "/home",
      "portal/home",
    ]) {
      expect(safePortalDestination(hostile)).toBe(DEFAULT_DESTINATION);
    }
  });

  test("refuses the pages that do the redirecting, so sign-in can't loop", () => {
    expect(safePortalDestination("/portal/login")).toBe(DEFAULT_DESTINATION);
    expect(safePortalDestination("/portal/login?error=no_access")).toBe(
      DEFAULT_DESTINATION,
    );
    expect(safePortalDestination("/portal/set-password")).toBe(
      DEFAULT_DESTINATION,
    );
  });
});

describe("safeSiteDestination", () => {
  const FALLBACK = "/portal/set-password";

  test("keeps a path in either area", () => {
    expect(safeSiteDestination("/portal/set-password?next=/my", FALLBACK)).toBe(
      "/portal/set-password?next=/my",
    );
    expect(safeSiteDestination("/my", FALLBACK)).toBe("/my");
  });

  test("falls back when there is no destination", () => {
    expect(safeSiteDestination(null, FALLBACK)).toBe(FALLBACK);
    expect(safeSiteDestination("", FALLBACK)).toBe(FALLBACK);
  });

  // The reason this function exists. `new URL("//evil.example", origin)`
  // resolves to another origin, so the leading-slash test /auth/confirm used
  // to apply sent the browser off-site after a successful token verification.
  test("refuses a protocol-relative URL that a leading-slash test admits", () => {
    expect(safeSiteDestination("//evil.example", FALLBACK)).toBe(FALLBACK);
    expect(safeSiteDestination("//evil.example/steal", FALLBACK)).toBe(
      FALLBACK,
    );
    expect(safeSiteDestination("/\\evil.example", FALLBACK)).toBe(FALLBACK);
  });

  test("refuses an absolute URL", () => {
    expect(safeSiteDestination("https://evil.example/phish", FALLBACK)).toBe(
      FALLBACK,
    );
    expect(safeSiteDestination("javascript:alert(1)", FALLBACK)).toBe(FALLBACK);
  });
});

describe("safeSetPasswordDestination", () => {
  test("sends a constituent back to their own area", () => {
    expect(safeSetPasswordDestination("/my")).toBe("/my");
  });

  test("defaults to the portal dashboard", () => {
    expect(safeSetPasswordDestination(null)).toBe("/portal/home");
    expect(safeSetPasswordDestination(undefined)).toBe("/portal/home");
    expect(safeSetPasswordDestination("/portal/home")).toBe("/portal/home");
  });

  test("refuses anything else outright", () => {
    // An allowlist of two, because this decides where a browser goes with a
    // freshly set password on it.
    expect(safeSetPasswordDestination("/my/events")).toBe("/portal/home");
    expect(safeSetPasswordDestination("//evil.example")).toBe("/portal/home");
    expect(safeSetPasswordDestination("https://evil.example")).toBe(
      "/portal/home",
    );
  });
});
