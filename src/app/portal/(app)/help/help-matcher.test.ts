import { describe, expect, test } from "bun:test";
import { resolveHelpKey } from "./help-matcher";

const keys = [
  "/portal",
  "/portal/calendar",
  "/portal/calendar/work-queue",
  "/portal/finance/reports",
];

describe("resolveHelpKey", () => {
  test("exact match wins", () => {
    expect(resolveHelpKey("/portal/calendar", keys)).toBe("/portal/calendar");
  });

  test("longest prefix wins over shorter ones", () => {
    expect(resolveHelpKey("/portal/calendar/work-queue", keys)).toBe(
      "/portal/calendar/work-queue",
    );
  });

  test("unregistered subroute falls back to its module entry", () => {
    expect(resolveHelpKey("/portal/calendar/some-item-id", keys)).toBe(
      "/portal/calendar",
    );
  });

  test("unregistered module falls back to the portal root", () => {
    expect(resolveHelpKey("/portal/governance/meetings", keys)).toBe("/portal");
  });

  test("matches on segment boundaries only", () => {
    expect(resolveHelpKey("/portal/calendars", keys)).toBe("/portal");
  });

  test("ignores a trailing slash", () => {
    expect(resolveHelpKey("/portal/finance/reports/", keys)).toBe(
      "/portal/finance/reports",
    );
  });

  test("returns null when nothing matches", () => {
    expect(resolveHelpKey("/somewhere/else", keys)).toBeNull();
  });
});
