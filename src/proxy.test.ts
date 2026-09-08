import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { resolvePortalRoute } from "./proxy";

const PORTAL = "portal.example.org";
const PUBLIC = "www.example.org";

// The apex -> portal redirect now reads PORTAL_REDIRECT_HOSTS rather than a
// literal, so these cases have to declare the DNS promise they are testing
// (#795 Phase 2). Two tenants are configured, because "the redirect goes to
// *a* portal host" and "the redirect goes to *this host's* portal" are
// different claims and only a second tenant tells them apart.
const original = process.env.PORTAL_REDIRECT_HOSTS;

beforeAll(() => {
  process.env.PORTAL_REDIRECT_HOSTS = "example.org, second.org";
});

afterAll(() => {
  if (original === undefined) delete process.env.PORTAL_REDIRECT_HOSTS;
  else process.env.PORTAL_REDIRECT_HOSTS = original;
});

describe("resolvePortalRoute on the portal host", () => {
  test("rewrites a bare page path into the /portal route group", () => {
    expect(resolvePortalRoute(PORTAL, "/home")).toEqual({
      kind: "rewrite",
      pathname: "/portal/home",
    });
  });

  test("rewrites the root to the portal index", () => {
    expect(resolvePortalRoute(PORTAL, "/")).toEqual({
      kind: "rewrite",
      pathname: "/portal/",
    });
  });

  test("strips the internal /portal prefix off a document request", () => {
    expect(resolvePortalRoute(PORTAL, "/portal/home")).toEqual({
      kind: "redirect",
      host: PORTAL,
      pathname: "/home",
      status: 307,
    });
  });

  test("strips bare /portal down to the root", () => {
    expect(resolvePortalRoute(PORTAL, "/portal")).toEqual({
      kind: "redirect",
      host: PORTAL,
      pathname: "/",
      status: 307,
    });
  });

  test("serves prefixed RSC and Server Action requests instead of redirecting", () => {
    expect(resolvePortalRoute(PORTAL, "/portal/home", true)).toEqual({
      kind: "pass",
    });
  });

  test("leaves the OAuth callback at the app root", () => {
    expect(resolvePortalRoute(PORTAL, "/auth/callback")).toEqual({
      kind: "pass",
    });
  });

  test("leaves the email confirm route at the app root", () => {
    expect(resolvePortalRoute(PORTAL, "/auth/confirm")).toEqual({
      kind: "pass",
    });
  });

  test("leaves route handlers under /api at the app root", () => {
    expect(resolvePortalRoute(PORTAL, "/api/cron/task-reminders")).toEqual({
      kind: "pass",
    });
  });

  test("leaves public/ assets at the app root", () => {
    expect(resolvePortalRoute(PORTAL, "/chatter-logo-transparent.png")).toEqual(
      { kind: "pass" },
    );
  });
});

describe("resolvePortalRoute on a tenant's portal host", () => {
  test("rewrites a bare page path the same way the Chatter Snow portal host does", () => {
    expect(resolvePortalRoute("portal.example-nonprofit.org", "/home")).toEqual(
      { kind: "rewrite", pathname: "/portal/home" },
    );
  });

  test("leaves the auth callback at the app root", () => {
    expect(
      resolvePortalRoute("portal.example-nonprofit.org", "/auth/callback"),
    ).toEqual({ kind: "pass" });
  });

  test("strips the internal /portal prefix without leaving the tenant's own host", () => {
    expect(
      resolvePortalRoute("portal.example-nonprofit.org", "/portal/home"),
    ).toEqual({
      kind: "redirect",
      host: "portal.example-nonprofit.org",
      pathname: "/home",
      status: 307,
    });
  });

  test("does not redirect a tenant apex's /portal path, which has no promised subdomain", () => {
    expect(resolvePortalRoute("example-nonprofit.org", "/portal/home")).toEqual(
      { kind: "pass" },
    );
  });
});

describe("resolvePortalRoute on the public hosts", () => {
  test("redirects /portal/* to the portal host without the prefix", () => {
    expect(resolvePortalRoute(PUBLIC, "/portal/home")).toEqual({
      kind: "redirect",
      host: PORTAL,
      pathname: "/home",
      status: 308,
    });
  });

  test("redirects bare /portal to the portal host root", () => {
    expect(resolvePortalRoute("example.org", "/portal")).toEqual({
      kind: "redirect",
      host: PORTAL,
      pathname: "/",
      status: 308,
    });
  });

  // Each tenant's apex has to reach its own portal. A single PORTAL_HOST
  // constant could not express this at all -- it sent every public host to
  // one tenant's subdomain.
  test("sends each configured host to its own portal subdomain", () => {
    expect(resolvePortalRoute("second.org", "/portal/home")).toEqual({
      kind: "redirect",
      host: "portal.second.org",
      pathname: "/home",
      status: 308,
    });
  });

  test("does not touch public pages", () => {
    expect(resolvePortalRoute(PUBLIC, "/gears")).toEqual({ kind: "pass" });
  });

  test("does not touch preview or local hosts", () => {
    expect(resolvePortalRoute("localhost:3000", "/portal/home")).toEqual({
      kind: "pass",
    });
  });
});
