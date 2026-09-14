import { describe, expect, test } from "bun:test";
import {
  serviceWorkerScope,
  shouldRegisterServiceWorker,
} from "@/lib/pwa/service-worker";

describe("serviceWorkerScope", () => {
  test("is the whole origin on a host that serves the portal at its root", () => {
    expect(serviceWorkerScope("portal.chattersnow.org")).toBe("/");
    expect(serviceWorkerScope("portal.rickiecruz.com")).toBe("/");
  });

  test("is the portal alone on a host that also serves a public site", () => {
    // The marketing site is not what anyone installs, so the worker has no
    // business caching it.
    expect(serviceWorkerScope("www.chattersnow.org")).toBe("/portal/");
    expect(serviceWorkerScope("demo.rickiecruz.com")).toBe("/portal/");
    expect(serviceWorkerScope("localhost")).toBe("/portal/");
  });

  test("ends in a slash so it cannot claim a sibling path", () => {
    expect(serviceWorkerScope("example.org").endsWith("/")).toBe(true);
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
