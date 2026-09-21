import { describe, expect, test } from "bun:test";
import {
  serviceWorkerScope,
  shouldRegisterServiceWorker,
} from "@/lib/pwa/service-worker";

describe("serviceWorkerScope", () => {
  test("is the whole origin for whichever surface owns it", () => {
    // A `portal.` host for the portal; a host whose portal lives on a
    // subdomain of its own for the public site.
    expect(serviceWorkerScope("portal", true)).toBe("/");
    expect(serviceWorkerScope("public", true)).toBe("/");
  });

  test("is one surface's subtree where a single origin serves both", () => {
    expect(serviceWorkerScope("portal", false)).toBe("/portal/");
    expect(serviceWorkerScope("public", false)).toBe("/my/");
  });

  test("the two scopes cannot claim each other's pages", () => {
    const portal = serviceWorkerScope("portal", false);
    const supporter = serviceWorkerScope("public", false);
    expect(portal.startsWith(supporter)).toBe(false);
    expect(supporter.startsWith(portal)).toBe(false);
  });

  test("ends in a slash so it cannot claim a sibling path", () => {
    // `/portal` would also claim a future `/portal-status`.
    expect(serviceWorkerScope("portal", false).endsWith("/")).toBe(true);
    expect(serviceWorkerScope("public", false).endsWith("/")).toBe(true);
  });
});

describe("shouldRegisterServiceWorker", () => {
  const browser = { webdriver: false, serviceWorker: {} };

  test("registers in a real production browser", () => {
    expect(shouldRegisterServiceWorker(browser, true)).toBe(true);
  });

  test("never registers under automation", () => {
    // Both browser suites run against a production build, so without this the
    // worker would cache across specs that are meant to be independent.
    expect(
      shouldRegisterServiceWorker({ ...browser, webdriver: true }, true),
    ).toBe(false);
  });

  test("never registers in development, where chunks are not immutable", () => {
    expect(shouldRegisterServiceWorker(browser, false)).toBe(false);
  });

  test("does nothing where the browser has no service workers", () => {
    expect(
      shouldRegisterServiceWorker(
        { webdriver: false, serviceWorker: undefined },
        true,
      ),
    ).toBe(false);
  });
});
