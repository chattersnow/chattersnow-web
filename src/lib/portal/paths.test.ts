import { describe, expect, test } from "bun:test";
import {
  isPortalHost,
  isPortalPathname,
  stripPortalPrefix,
  toPortalPathname,
} from "./paths";

describe("portal host recognition", () => {
  test("matches Chatter Snow's own portal host", () => {
    expect(isPortalHost("portal.chattersnow.org")).toBe(true);
  });

  test("matches a tenant's portal subdomain on its own domain", () => {
    expect(isPortalHost("portal.example-nonprofit.org")).toBe(true);
  });

  test("does not match public or lookalike hosts", () => {
    expect(isPortalHost("chattersnow.org")).toBe(false);
    expect(isPortalHost("www.chattersnow.org")).toBe(false);
    expect(isPortalHost("portalx.example.org")).toBe(false);
    expect(isPortalHost("localhost")).toBe(false);
  });
});

describe("portal path translation", () => {
  test("recognizes canonical portal paths without matching lookalikes", () => {
    expect(isPortalPathname("/portal")).toBe(true);
    expect(isPortalPathname("/portal/home")).toBe(true);
    expect(isPortalPathname("/portals")).toBe(false);
    expect(isPortalPathname("/home")).toBe(false);
  });

  test("adds the prefix to a visible portal-host path", () => {
    expect(toPortalPathname("/home")).toBe("/portal/home");
    expect(toPortalPathname("/")).toBe("/portal");
  });

  test("leaves an already-canonical path untouched", () => {
    expect(toPortalPathname("/portal/events/new")).toBe("/portal/events/new");
  });

  test("strips the prefix back off", () => {
    expect(stripPortalPrefix("/portal/home")).toBe("/home");
    expect(stripPortalPrefix("/portal")).toBe("/");
    expect(stripPortalPrefix("/gears")).toBe("/gears");
  });

  test("round-trips every canonical path", () => {
    for (const path of [
      "/portal",
      "/portal/home",
      "/portal/finance/donations",
    ]) {
      expect(toPortalPathname(stripPortalPrefix(path))).toBe(path);
    }
  });
});
