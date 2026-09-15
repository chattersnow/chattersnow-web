import { describe, expect, test } from "bun:test";
import { resolveDestination, resolveFailureDestination } from "./route";

const ORIGIN = "https://chattersnow.example";

describe("resolveDestination", () => {
  test("defaults to /portal/home when next is missing", () => {
    expect(resolveDestination(null, ORIGIN)).toBe("/portal/home");
  });

  test("allows a same-origin path", () => {
    expect(resolveDestination("/portal/events", ORIGIN)).toBe("/portal/events");
  });

  test("preserves query string on a same-origin path", () => {
    expect(resolveDestination("/portal/events?tab=upcoming", ORIGIN)).toBe(
      "/portal/events?tab=upcoming",
    );
  });

  test("rejects a protocol-relative URL pointing off-origin", () => {
    expect(resolveDestination("//evil.com", ORIGIN)).toBe("/portal/home");
  });

  test("rejects an absolute URL pointing off-origin", () => {
    expect(resolveDestination("https://evil.com/phish", ORIGIN)).toBe(
      "/portal/home",
    );
  });

  test("rejects a malformed URL", () => {
    expect(resolveDestination("http://", ORIGIN)).toBe("/portal/home");
  });
});

describe("resolveFailureDestination", () => {
  // A constituent sent to the portal login would be answered with a screen
  // they hold no role for -- a failed sign-in followed by a second dead end.
  test("sends a constituent back to their own sign-in", () => {
    expect(resolveFailureDestination("/my")).toBe(
      "/my/sign-in?error=oauth_failed",
    );
    expect(resolveFailureDestination("/my/events")).toBe(
      "/my/sign-in?error=oauth_failed",
    );
  });

  test("sends everyone else to the portal login, as before", () => {
    expect(resolveFailureDestination("/portal/home")).toBe(
      "/portal/login?error=oauth_failed",
    );
    expect(resolveFailureDestination("/portal/events")).toBe(
      "/portal/login?error=oauth_failed",
    );
  });

  test("is not fooled by a path that merely starts with the prefix", () => {
    expect(resolveFailureDestination("/mystery")).toBe(
      "/portal/login?error=oauth_failed",
    );
  });
});
