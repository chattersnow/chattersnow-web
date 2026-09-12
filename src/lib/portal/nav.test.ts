import { describe, expect, test } from "bun:test";
import type { PermissionMap } from "@/lib/auth/permissions";
import {
  NAV_ITEMS,
  activeSectionFor,
  activeSubItemFor,
  firstAccessibleHref,
  navSubGroups,
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

describe("Finance section", () => {
  test("the three Sales pages are reachable on sales:manage alone (#907, #908)", () => {
    // event_coordinator's shape: sales:manage with finance:none. The section
    // has to open for them, and on the ledger rather than a page they cannot
    // read.
    const coordinator: PermissionMap = { sales: "manage" };
    const items = visibleNavItems(coordinator);
    const finance = items.find((item) => item.value === "finance");
    expect(finance?.subItems?.map((sub) => sub.value)).toEqual([
      "sales",
      "register",
      "products",
    ]);
    expect(firstAccessibleHref(coordinator, "finance")).toBe(
      "/portal/finance/sales",
    );
  });

  test("sales:view reaches the ledger and neither of the pages that write (#908)", () => {
    // The register and the catalog editor are gated at manage by their own
    // layouts, so a view-only holder offered either would reach a 403 through
    // the sidebar. The ledger is a read and opens.
    const viewer: PermissionMap = { sales: "view" };
    const items = visibleNavItems(viewer);
    expect(items.map((item) => item.value)).toEqual(["overview", "finance"]);
    expect(
      items
        .find((item) => item.value === "finance")
        ?.subItems?.map((sub) => sub.value),
    ).toEqual(["sales"]);
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

describe("Volunteers section", () => {
  test("still lands on Roles, not the cross-linked directory", () => {
    // Directory is listed last on purpose: volunteers/page.tsx redirects via
    // firstAccessibleHref, so a first-placed entry would move the section's
    // landing page.
    expect(firstAccessibleHref({ volunteers: "view" }, "volunteers")).toBe(
      "/portal/volunteers/roles",
    );
  });

  test("hides the directory from someone who cannot read People", () => {
    // The page is gated by people/layout.tsx, so the cross-link is gated the
    // same way rather than on volunteers:view.
    const volunteersOnly: PermissionMap = { volunteers: "view" };
    expect(
      visibleNavItems(volunteersOnly)
        .find((item) => item.value === "volunteers")
        ?.subItems?.map((sub) => sub.value),
    ).toEqual(["roles", "participation", "applications"]);
  });

  test("the directory alone does not hold the section open (#903)", () => {
    // `people` is a core module and people:view is held by almost everyone, so
    // before the cross-link carried alsoRequires, a tenant whose Volunteers
    // module was off still got a Volunteers heading in the sidebar with this
    // one link under it -- advertising a module it was never sold. The link
    // worked; the heading was the lie.
    const peopleOnly: PermissionMap = { people: "view" };
    expect(visibleNavItems(peopleOnly).map((item) => item.value)).not.toContain(
      "volunteers",
    );
    expect(firstAccessibleHref(peopleOnly, "volunteers")).toBeNull();
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

  test("owns the volunteer directory, which Volunteers only cross-links", () => {
    // One page, two entry points. activeSectionFor's first pass matches
    // basePath, so the section the URL actually lives under wins over the
    // Volunteers section that merely lists the same href.
    expect(activeSectionFor("/portal/people/volunteers")).toBe("people");
    const people = NAV_ITEMS.find((item) => item.value === "people")!;
    expect(activeSubItemFor("/portal/people/volunteers", people)).toBe(
      "volunteers",
    );
  });

  test("owns the partners segment", () => {
    expect(activeSectionFor("/portal/partners")).toBe("people");
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

describe("navSubGroups", () => {
  test("every section's grouped sub-items are contiguous", () => {
    // The invariant the whole design rests on (#942). Grouping is derived by
    // walking the list once, so a section that interleaved two groups would
    // silently render the same heading twice rather than fail. Nothing else
    // catches it: the type allows any order.
    for (const item of NAV_ITEMS) {
      if (!item.subItems) continue;
      const labels = navSubGroups(item.subItems)
        .map((group) => group.label)
        .filter((label): label is string => Boolean(label));
      expect(new Set(labels).size, `${item.value} interleaves its groups`).toBe(
        labels.length,
      );
    }
  });

  test("an ungrouped section is one unlabelled group", () => {
    const governance = NAV_ITEMS.find((item) => item.value === "governance")!;
    const groups = navSubGroups(governance.subItems!);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBeUndefined();
    expect(groups[0].items).toHaveLength(governance.subItems!.length);
  });

  test("groups Administration in nav order", () => {
    const administration = NAV_ITEMS.find(
      (item) => item.value === "administration",
    )!;
    expect(
      navSubGroups(administration.subItems!).map((group) => [
        group.label,
        group.items.map((sub) => sub.value),
      ]),
    ).toEqual([
      ["Access & identity", ["users", "roles", "permissions"]],
      ["Organization", ["system-settings", "site-content"]],
      ["Technology & platform", ["access-management", "platform"]],
      ["Oversight", ["audit-log", "data-retention"]],
    ]);
  });

  test("a group whose every item is filtered out leaves no heading", () => {
    // site_content:view alone reaches exactly one Administration page, so the
    // other three headings must not survive -- a heading over nothing is the
    // failure mode this design exists to make impossible.
    const editor: PermissionMap = { site_content: "view" };
    const administration = visibleNavItems(editor).find(
      (item) => item.value === "administration",
    )!;
    expect(
      navSubGroups(administration.subItems!).map((group) => [
        group.label,
        group.items.map((sub) => sub.value),
      ]),
    ).toEqual([["Organization", ["site-content"]]]);
  });

  test("a group heading resolves lexicon templates like any other label", () => {
    // Group headings are user-facing copy. None carries a template today, so
    // this guards the wiring rather than a current string: without it, the
    // first tenant-worded heading would print braces (#896).
    const admin: PermissionMap = { administration: "manage" };
    const administration = visibleNavItems(admin).find(
      (item) => item.value === "administration",
    )!;
    for (const sub of administration.subItems ?? []) {
      expect(sub.group ?? "").not.toContain("{");
    }
  });
});
