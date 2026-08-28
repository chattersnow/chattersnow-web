import { describe, expect, mock, test } from "bun:test";
import type { PermissionMap } from "./permissions";

const redirectMock = mock((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});

mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
    prefetch: () => {},
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: redirectMock,
  permanentRedirect: () => {},
  notFound: () => {},
}));

const {
  hasPermission,
  hasAnyPermission,
  getCurrentUserPermissions,
  requireAnyPermission,
  requirePermission,
} = await import("./permissions");

function fakeSupabase(rows: { resource_key: string; level: string }[]) {
  return { rpc: async () => ({ data: rows }) } as never;
}

describe("hasPermission", () => {
  test("true when the user's level meets the minimum", () => {
    expect(hasPermission({ events: "manage" }, "events", "view")).toBe(true);
  });

  test("false when the user's level is below the minimum", () => {
    expect(hasPermission({ events: "view" }, "events", "manage")).toBe(false);
  });

  test("treats a missing resource as 'none'", () => {
    expect(hasPermission({}, "events")).toBe(false);
  });

  test("defaults the minimum level to 'view'", () => {
    expect(hasPermission({ events: "view" }, "events")).toBe(true);
  });
});

describe("hasAnyPermission", () => {
  test("true if any check passes", () => {
    const permissions: PermissionMap = { events: "none", finance: "manage" };
    expect(
      hasAnyPermission(permissions, [
        { resource: "events", level: "view" },
        { resource: "finance", level: "manage" },
      ]),
    ).toBe(true);
  });

  test("false if no checks pass", () => {
    const permissions: PermissionMap = { events: "none" };
    expect(
      hasAnyPermission(permissions, [{ resource: "events", level: "view" }]),
    ).toBe(false);
  });

  test("false for an empty check list", () => {
    expect(hasAnyPermission({ events: "manage" }, [])).toBe(false);
  });
});

describe("getCurrentUserPermissions", () => {
  test("maps rpc rows into a resource -> level record", async () => {
    const supabase = fakeSupabase([
      { resource_key: "events", level: "manage" },
      { resource_key: "finance", level: "view" },
    ]);
    expect(await getCurrentUserPermissions(supabase)).toEqual({
      events: "manage",
      finance: "view",
    });
  });

  test("returns an empty map when rpc data is null", async () => {
    const supabase = { rpc: async () => ({ data: null }) } as never;
    expect(await getCurrentUserPermissions(supabase)).toEqual({});
  });
});

describe("requirePermission / requireAnyPermission", () => {
  test("returns the permission map without redirecting when satisfied", async () => {
    const supabase = fakeSupabase([
      { resource_key: "events", level: "manage" },
    ]);
    await expect(
      requirePermission(supabase, "events", "view"),
    ).resolves.toEqual({
      events: "manage",
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  test("redirects to /portal/home when unsatisfied", async () => {
    redirectMock.mockClear();
    const supabase = fakeSupabase([{ resource_key: "events", level: "none" }]);
    await expect(
      requirePermission(supabase, "events", "manage"),
    ).rejects.toThrow("REDIRECT:/portal/home");
    expect(redirectMock).toHaveBeenCalledWith("/portal/home");
  });

  test("requireAnyPermission is satisfied if any check passes", async () => {
    redirectMock.mockClear();
    const supabase = fakeSupabase([
      { resource_key: "finance", level: "manage" },
    ]);
    await requireAnyPermission(supabase, [
      { resource: "events", level: "view" },
      { resource: "finance", level: "manage" },
    ]);
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
