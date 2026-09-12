import { describe, expect, test } from "bun:test";
import type { PermissionMap } from "@/lib/auth/permissions";
import {
  NAV_ITEMS,
  activeSectionFor,
  activeSubItemFor,
  firstAccessibleHref,
  navGroups,
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
  test("owns every segment, all of which now sit under its basePath", () => {
    // #957 moved the six that used to be top-level routes (/portal/donors and
    // friends) in beside the volunteer one, so one basePath prefix claims the
    // lot -- which is what let the eight sidebar entries collapse to one.
    for (const path of [
      "/portal/people",
      "/portal/people/donors",
      "/portal/people/sponsors",
      "/portal/people/volunteers",
      "/portal/people/attendees",
      "/portal/people/staff",
      "/portal/people/partners",
      "/portal/people/organizations",
    ]) {
      expect(activeSectionFor(path)).toBe("people");
    }
  });

  test("still owns the directory's detail and duplicate routes", () => {
    expect(activeSectionFor("/portal/people/abc-123")).toBe("people");
    expect(activeSectionFor("/portal/people/duplicates")).toBe("people");
  });

  test("is one entry with no sub-items", () => {
    // The segments are a strip on the page, not eight links in the sidebar
    // (#957). A sub-item here would be a second way to do the same thing.
    const people = NAV_ITEMS.find((item) => item.value === "people")!;
    expect(people.subItems).toBeUndefined();
  });

  test("owns the volunteer directory, which Volunteers only cross-links", () => {
    // One page, two entry points. activeSectionFor's first pass matches
    // basePath, so the section the URL actually lives under wins over the
    // Volunteers section that merely lists the same href.
    expect(activeSectionFor("/portal/people/volunteers")).toBe("people");
    const volunteers = NAV_ITEMS.find((item) => item.value === "volunteers")!;
    expect(activeSubItemFor("/portal/people/volunteers", volunteers)).toBe(
      "directory",
    );
  });
});

describe("navGroups", () => {
  test("the top-level sections' groups are contiguous", () => {
    // Same invariant as the sub-item one below, one level up (#954). Grouping
    // is derived by walking the list once, so a section filed out of order
    // would silently render its heading twice rather than fail.
    const labels = navGroups(NAV_ITEMS)
      .map((group) => group.label)
      .filter((label): label is string => Boolean(label));
    expect(new Set(labels).size).toBe(labels.length);
  });

  test("groups the top level in nav order, Dashboard ungrouped on top", () => {
    expect(
      navGroups(NAV_ITEMS).map((group) => [
        group.label,
        group.items.map((item) => item.value),
      ]),
    ).toEqual([
      [undefined, ["overview"]],
      ["Delivery", ["events", "calendar", "programs", "artwork"]],
      ["People", ["people", "volunteers", "messages"]],
      ["Resources", ["inventory", "finance"]],
      // Technology (#943), Website (#944) and Platform (#945) all joined this
      // group rather than becoming new headings -- which is why promoting
      // three sections out of Administration cost the sidebar no extra width.
      [
        "Organization",
        ["platform", "website", "technology", "governance", "administration"],
      ],
    ]);
  });

  test("a top-level group whose every section is filtered out disappears", () => {
    // governance:manage reaches exactly one section, so three of the four
    // headings must not survive -- and Dashboard, which is ungrouped and
    // always visible, must still lead.
    const boardOnly: PermissionMap = { governance: "manage" };
    expect(
      navGroups(visibleNavItems(boardOnly)).map((group) => [
        group.label,
        group.items.map((item) => item.value),
      ]),
    ).toEqual([
      [undefined, ["overview"]],
      ["Organization", ["governance"]],
    ]);
  });

  test("every section's grouped sub-items are contiguous", () => {
    // The invariant the whole design rests on (#942). Grouping is derived by
    // walking the list once, so a section that interleaved two groups would
    // silently render the same heading twice rather than fail. Nothing else
    // catches it: the type allows any order.
    for (const item of NAV_ITEMS) {
      if (!item.subItems) continue;
      const labels = navGroups(item.subItems)
        .map((group) => group.label)
        .filter((label): label is string => Boolean(label));
      expect(new Set(labels).size, `${item.value} interleaves its groups`).toBe(
        labels.length,
      );
    }
  });

  test("an ungrouped section is one unlabelled group", () => {
    // Governance was this test's subject until #987 grouped it. Volunteers is
    // the replacement: four sub-items, no group key on any of them, and no
    // reason in the IA work to expect one.
    const volunteers = NAV_ITEMS.find((item) => item.value === "volunteers")!;
    const groups = navGroups(volunteers.subItems!);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBeUndefined();
    expect(groups[0].items).toHaveLength(volunteers.subItems!.length);
  });

  test("groups Governance in nav order", () => {
    // Three headings over ten identically gated entries (#987), and the one
    // move the grouping required: Resolutions came from eighth to sit beside
    // Meetings. Partnerships and Grants stay here rather than moving to
    // Finance -- both are pipelines, and `board` holds governance:manage with
    // finance: none, so the move would take them from the readers who use them.
    const governance = NAV_ITEMS.find((item) => item.value === "governance")!;
    expect(
      navGroups(governance.subItems!).map((group) => [
        group.label,
        group.items.map((sub) => sub.value),
      ]),
    ).toEqual([
      ["Board proceedings", ["board-members", "meetings", "resolutions"]],
      [
        "Standing obligations",
        [
          "bylaws",
          "policies",
          "conflict-of-interest",
          "annual-requirements",
          "nonprofit-status",
        ],
      ],
      ["External relationships", ["partnerships", "grants"]],
    ]);
  });

  test("governance:manage keeps all three Governance headings", () => {
    // The gate is identical on all ten, so unlike Administration there is no
    // permission that empties a heading. The board member who holds this and
    // nothing else sees the whole section, groups and all.
    const board: PermissionMap = { governance: "manage" };
    const governance = visibleNavItems(board).find(
      (item) => item.value === "governance",
    )!;
    expect(navGroups(governance.subItems!).map((group) => group.label)).toEqual(
      ["Board proceedings", "Standing obligations", "External relationships"],
    );
    expect(governance.subItems).toHaveLength(10);
  });

  test("grouping Governance moved no route", () => {
    // #987 is a group key on ten existing entries: no route moves, no gate
    // changes, no redirect. Every href still points under /portal/governance,
    // and the section's own href still lands on Board Members.
    const governance = NAV_ITEMS.find((item) => item.value === "governance")!;
    expect(governance.href).toBe("/portal/governance/board-members");
    for (const sub of governance.subItems ?? []) {
      expect(sub.href).toBe(`/portal/governance/${sub.value}`);
      expect(sub.access).toEqual([{ resource: "governance", level: "manage" }]);
    }
  });

  test("groups Finance in nav order, Financial Reports ungrouped at the end", () => {
    // #988. The three Sales pages took 37% of the section as peers although
    // the routes say parent and children, so a heading does the nesting that
    // NavItem has no third level for. Financial Reports carries no group on
    // purpose: it is the one entry with a different audience -- `board` holds
    // finance_reports:view and reaches nothing else here -- and navGroups
    // returns a trailing ungrouped run as its own unlabelled group.
    const finance = NAV_ITEMS.find((item) => item.value === "finance")!;
    expect(
      navGroups(finance.subItems!).map((group) => [
        group.label,
        group.items.map((sub) => sub.value),
      ]),
    ).toEqual([
      ["Money in", ["donations", "revenue"]],
      ["Money out", ["expenses", "reimbursements"]],
      ["Sales", ["sales", "register", "products"]],
      [undefined, ["reports"]],
    ]);
  });

  test("grouping Finance moved no route and no gate", () => {
    // #988 is group keys and an order, nothing else: every page keeps the href
    // and the access it had, so no redirect was needed.
    const finance = NAV_ITEMS.find((item) => item.value === "finance")!;
    expect(
      Object.fromEntries(
        finance.subItems!.map((sub) => [
          sub.value,
          [sub.href, sub.access.map((a) => `${a.resource}:${a.level}`)],
        ]),
      ),
    ).toEqual({
      donations: ["/portal/finance/donations", ["finance:manage"]],
      revenue: ["/portal/finance/revenue", ["finance:manage"]],
      expenses: [
        "/portal/finance/expenses",
        ["finance:manage", "finance_approvals:manage"],
      ],
      reimbursements: [
        "/portal/finance/reimbursements",
        ["reimbursements:manage", "reimbursement_approvals:manage"],
      ],
      sales: ["/portal/finance/sales", ["sales:view"]],
      register: ["/portal/finance/sales/register", ["sales:manage"]],
      products: ["/portal/finance/sales/products", ["sales:manage"]],
      reports: ["/portal/finance/reports", ["finance_reports:view"]],
    });
  });

  test("reordering Finance left every landing page where it was", () => {
    // The reorder put Donations first, but visibleNavItems keeps item.href
    // whenever a reachable sub-item still has it -- so a finance:manage holder
    // still lands on Expenses, not on the new first entry. Only readers who
    // cannot open Expenses fall through to their own first reachable page, and
    // those are unchanged too.
    const cases: [PermissionMap, string][] = [
      [{ finance: "manage" }, "/portal/finance/expenses"],
      [{ finance_approvals: "manage" }, "/portal/finance/expenses"],
      [{ finance_reports: "view" }, "/portal/finance/reports"],
      [{ sales: "manage" }, "/portal/finance/sales"],
      [{ reimbursements: "manage" }, "/portal/finance/reimbursements"],
    ];
    for (const [permissions, href] of cases) {
      expect(firstAccessibleHref(permissions, "finance")).toBe(href);
    }
  });

  test("a Finance group whose every item is filtered out leaves no heading", () => {
    // event_coordinator's shape: sales:manage with finance: none. Money in and
    // Money out must not survive as headings over nothing, and Financial
    // Reports -- a different gate again -- must not appear either.
    const coordinator: PermissionMap = { sales: "manage" };
    const finance = visibleNavItems(coordinator).find(
      (item) => item.value === "finance",
    )!;
    expect(
      navGroups(finance.subItems!).map((group) => [
        group.label,
        group.items.map((sub) => sub.value),
      ]),
    ).toEqual([["Sales", ["sales", "register", "products"]]]);
  });

  test("the board member's Finance is one unlabelled entry", () => {
    // finance_reports:view reaches Financial Reports alone. It carries no
    // group, so the section renders as a single unlabelled run with no
    // heading above it -- which is why leaving it ungrouped is the right call
    // rather than an oversight.
    const board: PermissionMap = { finance_reports: "view" };
    const finance = visibleNavItems(board).find(
      (item) => item.value === "finance",
    )!;
    expect(
      navGroups(finance.subItems!).map((group) => [
        group.label,
        group.items.map((sub) => sub.value),
      ]),
    ).toEqual([[undefined, ["reports"]]]);
  });

  test("groups Administration in nav order", () => {
    const administration = NAV_ITEMS.find(
      (item) => item.value === "administration",
    )!;
    expect(
      navGroups(administration.subItems!).map((group) => [
        group.label,
        group.items.map((sub) => sub.value),
      ]),
    ).toEqual([
      // Two, not three: Permissions became a tab on Roles in #946.
      ["Access & identity", ["users", "roles"]],
      // Down to one item: Access Management left in #943, Site Content in
      // #944 and Platform in #945. The heading stays because it names a real
      // distinction from identity and oversight, and #947 put the page's
      // panels behind a tab strip -- five of them since #990, under the name
      // #992 gave the page.
      ["Organization", ["organization-settings"]],
      ["Oversight", ["audit-log", "data-retention"]],
    ]);
  });

  test("a group whose every item is filtered out leaves no heading", () => {
    // system_settings:manage alone reaches exactly one Administration page, so
    // the other two headings must not survive -- a heading over nothing is the
    // failure mode this design exists to make impossible.
    const board: PermissionMap = { system_settings: "manage" };
    const administration = visibleNavItems(board).find(
      (item) => item.value === "administration",
    )!;
    expect(
      navGroups(administration.subItems!).map((group) => [
        group.label,
        group.items.map((sub) => sub.value),
      ]),
    ).toEqual([["Organization", ["organization-settings"]]]);
  });

  test("groups Website in nav order, the moved settings last", () => {
    // #990 brought Layout, Page visibility and Legal documents here from
    // System Settings. They are a different job from writing the copy above
    // them -- and, more to the point, a different reader's job -- so they get
    // a heading rather than extending one flat list of six.
    const website = NAV_ITEMS.find((item) => item.value === "website")!;
    expect(
      navGroups(website.subItems!).map((group) => [
        group.label,
        group.items.map((sub) => sub.value),
      ]),
    ).toEqual([
      ["Content", ["pages", "articles", "content-packs"]],
      ["Site settings", ["page-layout", "page-visibility", "legal-documents"]],
    ]);
  });

  test("the board's Website is the moved settings and no CMS", () => {
    // The whole point of widening website/layout.tsx rather than granting the
    // board site_content:view (#990). `board` holds system_settings:manage and
    // no site_content at all, so the CMS entries filter out, the Content
    // heading goes with them, and what is left is the three pages whose writes
    // they can actually make.
    //
    // Three, not the two the ticket predicted: Layout is gated the same way,
    // because updateLayoutSettingAction goes through writeAppSetting and
    // checks system_settings:manage like the other two. Gating it on
    // site_content:view instead would offer it to a reader whose every save
    // would fail.
    const board: PermissionMap = { system_settings: "manage" };
    const website = visibleNavItems(board).find(
      (item) => item.value === "website",
    )!;
    expect(
      navGroups(website.subItems!).map((group) => [
        group.label,
        group.items.map((sub) => sub.value),
      ]),
    ).toEqual([
      ["Site settings", ["page-layout", "page-visibility", "legal-documents"]],
    ]);
    // And the section opens on one of them rather than on the page editor.
    expect(website.href).toBe("/portal/website/page-layout");
  });

  test("a content editor's Website is the CMS and none of the settings", () => {
    // The other direction, and the reason the three moved entries do not ask
    // for site_content: an editor holding it alone must not be offered pages
    // whose switches would refuse to save.
    const editor: PermissionMap = { site_content: "view" };
    const website = visibleNavItems(editor).find(
      (item) => item.value === "website",
    )!;
    expect(website.subItems?.map((sub) => sub.value)).toEqual([
      "pages",
      "articles",
    ]);
  });

  test("site_content:view reaches Website and no longer reaches Administration", () => {
    // The point of #944: a content editor holding nothing else used to be the
    // one reader Administration's gate admitted. They now get their own
    // section and no Administration entry at all. Content Packs stays hidden,
    // needing platform_tenants:manage as well.
    const editor: PermissionMap = { site_content: "view" };
    const sections = visibleNavItems(editor).map((item) => item.value);
    expect(sections).toContain("website");
    expect(sections).not.toContain("administration");
    const website = visibleNavItems(editor).find(
      (item) => item.value === "website",
    )!;
    expect(website.subItems?.map((sub) => sub.value)).toEqual([
      "pages",
      "articles",
    ]);
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
