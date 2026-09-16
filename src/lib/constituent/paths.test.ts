import { describe, expect, test } from "bun:test";
import { safeMyDestination } from "./paths";

describe("safeMyDestination", () => {
  test("keeps a path inside the constituent area", () => {
    expect(safeMyDestination("/my")).toBe("/my");
    expect(safeMyDestination("/my/events")).toBe("/my/events");
    expect(safeMyDestination("/my/events?tab=upcoming")).toBe(
      "/my/events?tab=upcoming",
    );
  });

  test("falls back when there is nothing to come back to", () => {
    expect(safeMyDestination(null)).toBe("/my");
    expect(safeMyDestination(undefined)).toBe("/my");
    expect(safeMyDestination("")).toBe("/my");
  });

  test("refuses anything that leaves the site", () => {
    expect(safeMyDestination("https://evil.example/phish")).toBe("/my");
    // Protocol-relative: a path to a parser, another origin to a browser.
    expect(safeMyDestination("//evil.example")).toBe("/my");
    expect(safeMyDestination("/\\evil.example")).toBe("/my");
  });

  // A constituent sent into the portal would be bounced straight back out to
  // the no-access screen, which reads as the sign-in having failed.
  test("refuses a path outside the constituent area", () => {
    expect(safeMyDestination("/portal/home")).toBe("/my");
    expect(safeMyDestination("/home")).toBe("/my");
  });

  test("is not fooled by a path that merely starts with the prefix", () => {
    expect(safeMyDestination("/mystery")).toBe("/my");
    expect(safeMyDestination("/my-account")).toBe("/my");
  });

  test("does not send anyone back to the sign-in page", () => {
    expect(safeMyDestination("/my/sign-in")).toBe("/my");
    expect(safeMyDestination("/my/sign-in?next=/my/events")).toBe("/my");
  });
});
