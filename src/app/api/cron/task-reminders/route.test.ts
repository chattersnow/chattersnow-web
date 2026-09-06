import { describe, expect, mock, test } from "bun:test";

// The route pulls in the admin client and the digest job, both of which import
// "server-only" -- it throws outside Next's bundler, so stub it, the same way
// src/lib/supabase/admin.integration.test.ts does.
mock.module("server-only", () => ({}));
const { isAuthorizedCronRequest } = await import("./route");

const SECRET = "s3cret-value";
const VALID = `Bearer ${SECRET}`;

describe("isAuthorizedCronRequest", () => {
  test("accepts the exact bearer token", () => {
    expect(isAuthorizedCronRequest(VALID, SECRET)).toBe(true);
  });

  test("refuses everything when no secret is configured", () => {
    // Fails closed on purpose: a route that opens up because someone forgot an
    // environment variable is a public endpoint nobody knows is public.
    expect(isAuthorizedCronRequest(VALID, undefined)).toBe(false);
    expect(isAuthorizedCronRequest(VALID, "")).toBe(false);
  });

  test("refuses a missing header", () => {
    expect(isAuthorizedCronRequest(null, SECRET)).toBe(false);
  });

  test("refuses the right secret with the wrong scheme", () => {
    expect(isAuthorizedCronRequest(SECRET, SECRET)).toBe(false);
    expect(isAuthorizedCronRequest(`Token ${SECRET}`, SECRET)).toBe(false);
  });

  test("refuses a wrong secret of the same length", () => {
    expect(
      isAuthorizedCronRequest(`Bearer ${"x".repeat(SECRET.length)}`, SECRET),
    ).toBe(false);
  });

  test("refuses a truncated or padded token without throwing", () => {
    // timingSafeEqual throws on a length mismatch, so the length guard has to
    // come first -- these two would be exceptions, not denials, without it.
    expect(
      isAuthorizedCronRequest(`Bearer ${SECRET.slice(0, -1)}`, SECRET),
    ).toBe(false);
    expect(isAuthorizedCronRequest(`${VALID}extra`, SECRET)).toBe(false);
  });

  test("refuses an empty header", () => {
    expect(isAuthorizedCronRequest("", SECRET)).toBe(false);
  });
});
