import { describe, expect, test } from "bun:test";
import type { PermissionMap } from "@/lib/auth/permissions";
import {
  NAV_ITEMS,
  activeSectionFor,
  activeSubItemFor,
  firstAccessibleHref,
  visibleNavItems,
} from "./nav";

describe("firstAccessibleHref", () => {
  test("skips section children the user can't open", () => {
    // The case the hardcoded /portal/finance redirect got wrong: a board
    // member holds finance_reports:view but not finance:manage, so Expenses
    // (the first child) is closed to them and Financial Reports is not.
    const boardMember: PermissionMap = { finance_reports: "view" };
    expect(firstAccessibleHref(boardMember, "finance")).toBe(
      "/portal/finance/reports",
    );
  });

  test("returns the section's own first child when everything is open", () => {
    const admin: PermissionMap = { finance: "manage" };
    expect(firstAccessibleHref(admin, "finance")).toBe(
      "/portal/finance/expenses",
    );
  });

  test("returns null when no child of the section is reachable", () => {
    expect(firstAccessibleHref({ events: "view" }, "governance")).toBeNull();
  });

  test("resolves sections that have no sub-items", () => {
    expect(firstAccessibleHref({ people: "view" }, "people")).toBe(
      "/portal/people",
    );
  });
});

describe("visibleNavItems", () => {
  test("drops sections with no reachable sub-item and prunes the rest", () => {
    const boardMember: PermissionMap = { finance_reports: "view" };
    const items = visibleNavItems(boardMember);

    expect(items.map((item) => item.value)).toEqual(["overview", "finance"]);
    expect(items[1].subItems?.map((sub) => sub.value)).toEqual(["reports"]);
  });

  test("always keeps the permission-free Dashboard entry", () => {
    expect(visibleNavItems({}).map((item) => item.value)).toEqual(["overview"]);
  });
});

describe("activeSectionFor", () => {
  test("matches a section by its base path, including nested routes", () => {
    expect(activeSectionFor("/portal/finance/expenses/abc")).toBe("finance");
    expect(activeSectionFor("/portal/home")).toBe("overview");
  });

  test("owns no section for routes outside the nav tree", () => {
    // /portal/account used to report "overview", so the sidebar highlighted
    // Dashboard while the user was on their account page.
    expect(activeSectionFor("/portal/account")).toBeUndefined();
    expect(activeSectionFor("/portal/welcome")).toBeUndefined();
  });
});

describe("People section", () => {
  test("owns its segments even though they sit outside /portal/people", () => {
    // Donors, Sponsors, Attendees, and Organizations are top-level routes, so
    // a basePath prefix alone would highlight nothing while the user is on
    // one of them.
    for (const path of [
      "/portal/donors",
      "/portal/sponsors",
      "/portal/attendees",
      "/portal/organizations",
    ]) {
      expect(activeSectionFor(path)).toBe("people");
    }
  });

  test("still owns the directory and its detail routes", () => {
    expect(activeSectionFor("/portal/people")).toBe("people");
    expect(activeSectionFor("/portal/people/abc-123")).toBe("people");
  });

  test("picks the segment the user is actually on", () => {
    const people = NAV_ITEMS.find((item) => item.value === "people")!;
    expect(activeSubItemFor("/portal/donors", people)).toBe("donors");
    expect(activeSubItemFor("/portal/organizations", people)).toBe(
      "organizations",
    );
    // A person's detail page belongs to the directory, not to whichever
    // segment linked to it.
    expect(activeSubItemFor("/portal/people/abc-123", people)).toBe(
      "directory",
    );
  });
});
