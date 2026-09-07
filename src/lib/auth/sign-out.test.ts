import { beforeEach, describe, expect, mock, test } from "bun:test";

const signOutMock = mock(async () => ({ error: null }));
mock.module("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({ auth: { signOut: signOutMock } }),
}));

const { buildLoginUrl, portalDestinationFrom, signOutAndRedirect } =
  await import("./sign-out");

function routerStub() {
  return { replace: mock(() => {}), refresh: mock(() => {}) };
}

describe("signOutAndRedirect", () => {
  beforeEach(() => {
    signOutMock.mockClear();
  });

  // Regression guard for #474. Supabase defaults signOut to `scope: "global"`,
  // which revokes every refresh token the account holds -- logging out in one
  // browser would end the same person's session on their phone, and in the
  // e2e suite it signed every other worker sharing the seeded admin account
  // out mid-test.
  test("ends only this browser's session", async () => {
    const router = routerStub();

    await signOutAndRedirect(
      router as unknown as Parameters<typeof signOutAndRedirect>[0],
    );

    expect(signOutMock).toHaveBeenCalledWith({ scope: "local" });
    expect(router.replace).toHaveBeenCalledWith("/portal/login");
    expect(router.refresh).toHaveBeenCalled();
  });

  test("leaves the portal even when the sign-out request fails", async () => {
    signOutMock.mockImplementationOnce(async () => {
      throw new Error("network down");
    });
    const router = routerStub();

    await signOutAndRedirect(
      router as unknown as Parameters<typeof signOutAndRedirect>[0],
      { reason: "idle" },
    );

    expect(router.replace).toHaveBeenCalledWith("/portal/login?reason=idle");
  });
});

describe("buildLoginUrl", () => {
  test("is the bare login page with nothing to carry over", () => {
    expect(buildLoginUrl()).toBe("/portal/login");
  });

  test("carries a reason and an in-portal return path", () => {
    expect(buildLoginUrl({ reason: "idle", next: "/portal/finance" })).toBe(
      "/portal/login?reason=idle&next=%2Fportal%2Ffinance",
    );
  });

  test("drops the dashboard as a return path, since that is the default", () => {
    expect(buildLoginUrl({ next: "/portal/home" })).toBe("/portal/login");
  });

  test("drops an off-portal return path rather than honouring it", () => {
    expect(buildLoginUrl({ next: "https://evil.test/steal" })).toBe(
      "/portal/login",
    );
  });
});

describe("portalDestinationFrom", () => {
  test("keeps a path that is already under /portal", () => {
    expect(portalDestinationFrom("/portal/events", "?tab=registrants")).toBe(
      "/portal/events?tab=registrants",
    );
  });

  // portal.chattersnow.org rewrites unprefixed paths into /portal/* internally,
  // so the address bar shows the bare path while the route is prefixed.
  test("re-adds the prefix the portal subdomain hides", () => {
    expect(portalDestinationFrom("/people")).toBe("/portal/people");
  });
});
