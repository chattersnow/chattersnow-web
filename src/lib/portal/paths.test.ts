import { describe, expect, test } from "bun:test";
import {
  isPortalHost,
  isPortalPathname,
  publicSiteLink,
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

describe("the login page's link back to the public site", () => {
  const chatterSnow = {
    name: "Chatter Snow",
    custom_domain: "chattersnow.org",
  };
  const platform = {
    name: "Platform",
    custom_domain: "portal.rickiecruz.com",
  };

  test("leaves the deployment for the tenant's own domain, from a portal host", () => {
    expect(publicSiteLink("portal.chattersnow.org", chatterSnow)).toEqual({
      href: "https://chattersnow.org/home",
      label: "chattersnow.org",
    });
  });

  test("is not offered at all when the tenant has no public site", () => {
    // The platform tenant's domain is the portal host itself: the
    // rickiecruz.com apex is the consulting site and is not served here, so
    // there is nowhere to go back to.
    expect(publicSiteLink("portal.rickiecruz.com", platform)).toBeNull();
  });

  test("stays relative off a portal host, so a preview stays on the preview", () => {
    expect(publicSiteLink("uat.chattersnow.org", chatterSnow)).toEqual({
      href: "/home",
      label: "chattersnow.org",
    });
  });

  test("falls back to the organization's name when no domain is set", () => {
    // The local stack and preview, where the tenant resolves through
    // TENANT_HOST_OVERRIDE rather than by domain.
    expect(
      publicSiteLink("127.0.0.1:3000", {
        name: "Chatter Snow",
        custom_domain: null,
      }),
    ).toEqual({ href: "/home", label: "Chatter Snow" });
  });

  test("is not offered on a portal host with no domain to link to", () => {
    expect(
      publicSiteLink("portal.example.test", {
        name: "Example",
        custom_domain: null,
      }),
    ).toBeNull();
  });

  test("is not offered when no tenant resolved", () => {
    expect(publicSiteLink("portal.chattersnow.org", null)).toBeNull();
    expect(publicSiteLink("someone-elses-domain.test", null)).toBeNull();
  });
});
