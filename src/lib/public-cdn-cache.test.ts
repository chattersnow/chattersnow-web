import { describe, expect, test } from "bun:test";
import {
  PUBLIC_CDN_CACHE_CONTROL,
  publicCdnCacheControl,
} from "./public-cdn-cache";

describe("publicCdnCacheControl", () => {
  test("caches the low-churn public pages #1467 measured", () => {
    for (const path of ["/home", "/about", "/privacy", "/brand", "/events"]) {
      expect(publicCdnCacheControl(path)).toBe(PUBLIC_CDN_CACHE_CONTROL);
    }
  });

  // The CDN honours s-maxage; a bare max-age would only instruct the browser.
  test("is a directive the CDN reads", () => {
    expect(PUBLIC_CDN_CACHE_CONTROL).toContain("s-maxage=");
  });

  test("treats a trailing slash as the same page", () => {
    expect(publicCdnCacheControl("/about/")).toBe(PUBLIC_CDN_CACHE_CONTROL);
  });

  test("caches a learn article but nothing deeper", () => {
    expect(publicCdnCacheControl("/learn/getting-started")).toBe(
      PUBLIC_CDN_CACHE_CONTROL,
    );
    expect(publicCdnCacheControl("/learn/a/b")).toBeNull();
  });

  // Each of these renders something that depends on who is asking, so one
  // visitor's copy must never be served to the next.
  test("leaves personal and form pages uncached", () => {
    for (const path of [
      "/events/e/0520fa8e-6c21-47bc-98d8-bb3b39f2accb",
      "/contact",
      "/get-involved/volunteer",
      "/inventory",
      "/inventory/donate",
      "/waiver",
      "/my",
      "/my/details",
      "/confirm-email-change",
    ]) {
      expect(publicCdnCacheControl(path)).toBeNull();
    }
  });

  test("leaves the portal and the index redirect alone", () => {
    expect(publicCdnCacheControl("/portal/home")).toBeNull();
    expect(publicCdnCacheControl("/")).toBeNull();
  });
});
