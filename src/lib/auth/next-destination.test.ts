import { describe, expect, test } from "bun:test";
import { DEFAULT_DESTINATION, safePortalDestination } from "./next-destination";

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
