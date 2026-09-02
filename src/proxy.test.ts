import { describe, expect, test } from "bun:test";
import { resolvePortalRoute } from "./proxy";

const PORTAL = "portal.chattersnow.org";
const PUBLIC = "www.chattersnow.org";

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

  test("leaves public/ assets at the app root", () => {
    expect(resolvePortalRoute(PORTAL, "/chatter-logo-transparent.png")).toEqual(
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
    expect(resolvePortalRoute("chattersnow.org", "/portal")).toEqual({
      kind: "redirect",
      host: PORTAL,
      pathname: "/",
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
