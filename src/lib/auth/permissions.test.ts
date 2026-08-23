import { describe, expect, test } from "bun:test";
import { hasAnyPermission, hasPermission, type PermissionMap } from "@/lib/auth/permissions";

describe("hasPermission", () => {
  test("returns false when the resource is missing from the map", () => {
    expect(hasPermission({}, "events", "view")).toBe(false);
  });

  test("returns false when the level is below the required minimum", () => {
    const permissions: PermissionMap = { events: "view" };
    expect(hasPermission(permissions, "events", "manage")).toBe(false);
  });

  test("returns true when the level meets the required minimum", () => {
    const permissions: PermissionMap = { events: "manage" };
    expect(hasPermission(permissions, "events", "view")).toBe(true);
    expect(hasPermission(permissions, "events", "manage")).toBe(true);
  });

  test("defaults the minimum level to view", () => {
    expect(hasPermission({ events: "view" }, "events")).toBe(true);
    expect(hasPermission({ events: "none" }, "events")).toBe(false);
  });
});

describe("hasAnyPermission", () => {
  test("returns true if any check is satisfied", () => {
    const permissions: PermissionMap = { finance: "none", inventory_intake: "manage" };
    expect(
      hasAnyPermission(permissions, [
        { resource: "finance", level: "manage" },
        { resource: "inventory_intake", level: "manage" },
      ]),
    ).toBe(true);
  });

  test("returns false if no check is satisfied", () => {
    const permissions: PermissionMap = { finance: "view" };
    expect(
      hasAnyPermission(permissions, [
        { resource: "finance", level: "manage" },
        { resource: "inventory_intake", level: "manage" },
      ]),
    ).toBe(false);
  });

  test("returns false for an empty checks list", () => {
    expect(hasAnyPermission({ events: "manage" }, [])).toBe(false);
  });
});
