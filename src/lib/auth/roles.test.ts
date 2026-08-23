import { describe, expect, mock, test } from "bun:test";

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

const { getCurrentUserRoles, hasAnyRole, isPortalRole, requireAnyRole } = await import(
  "@/lib/auth/roles"
);

function fakeSupabase(roles: string[]) {
  return { rpc: async () => ({ data: roles }) } as never;
}

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

describe("getCurrentUserRoles", () => {
  test("returns the rpc rows as roles", async () => {
    const supabase = fakeSupabase(["admin", "board"]);
    expect(await getCurrentUserRoles(supabase)).toEqual(["admin", "board"]);
  });

  test("returns an empty array when rpc data is null", async () => {
    const supabase = { rpc: async () => ({ data: null }) } as never;
    expect(await getCurrentUserRoles(supabase)).toEqual([]);
  });
});

describe("requireAnyRole", () => {
  test("returns the user's roles without redirecting when allowed", async () => {
    const supabase = fakeSupabase(["finance"]);
    await expect(requireAnyRole(supabase, ["finance", "admin"])).resolves.toEqual(["finance"]);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  test("redirects to /portal/home when the user holds none of the allowed roles", async () => {
    redirectMock.mockClear();
    const supabase = fakeSupabase(["volunteer"]);
    await expect(requireAnyRole(supabase, ["admin", "finance"])).rejects.toThrow(
      "REDIRECT:/portal/home",
    );
    expect(redirectMock).toHaveBeenCalledWith("/portal/home");
  });
});
