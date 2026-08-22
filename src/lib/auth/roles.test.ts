import { describe, expect, test } from "bun:test";
import { hasAnyRole, isPortalRole } from "@/lib/auth/roles";

describe("hasAnyRole", () => {
  test("returns true when the user holds one of the allowed roles", () => {
    expect(hasAnyRole(["volunteer", "finance"], ["admin", "finance"])).toBe(true);
  });

  test("returns false when the user holds none of the allowed roles", () => {
    expect(hasAnyRole(["volunteer"], ["admin", "finance"])).toBe(false);
  });

  test("returns false for an empty roles list", () => {
    expect(hasAnyRole([], ["admin"])).toBe(false);
  });

  test("returns false for an empty allowed list", () => {
    expect(hasAnyRole(["admin"], [])).toBe(false);
  });
});

describe("isPortalRole", () => {
  test("returns true for a known role", () => {
    expect(isPortalRole("admin")).toBe(true);
  });

  test("returns false for an unknown role", () => {
    expect(isPortalRole("superuser")).toBe(false);
  });
});
