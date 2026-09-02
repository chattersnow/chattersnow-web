import { describe, expect, test } from "bun:test";
import { isPortalPathname, stripPortalPrefix, toPortalPathname } from "./paths";

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
