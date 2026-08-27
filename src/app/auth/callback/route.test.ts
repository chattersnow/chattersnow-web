import { describe, expect, test } from "bun:test";
import { resolveDestination } from "./route";

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
