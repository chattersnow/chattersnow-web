import { describe, expect, test } from "bun:test";
import {
  LEGAL_LINKS,
  NAV_GROUPS,
  isHrefVisible,
  isSlotVisible,
  slotsForHref,
  visibleGroups,
} from "./public-nav";
import { PUBLIC_PAGE_SLOTS } from "./page-visibility";

/** The four sections the board had hidden when this nav was reworked. */
const HIDDEN = ["about", "programs", "learn", "support"];

describe("NAV_GROUPS", () => {
  test("every group's slot is a registered page-visibility slot", () => {
    const registered = new Set(PUBLIC_PAGE_SLOTS.map((slot) => slot.key));

    for (const group of NAV_GROUPS) {
      if (!group.slot) continue;
      expect(
        registered.has(group.slot),
        `${group.label} -> ${group.slot}`,
      ).toBe(true);
    }
  });

  // The nav and the footer render from this one list, so a section missing here
  // is missing from both. The old footer had its own list and had already
  // drifted -- it was missing About and Learn.
  test("every registered slot appears in the nav", () => {
    // Sub-links carry slots too since the sizing guide got its own, so a slot
    // counts as present whether it gates a group or one item inside one.
    const inNav = new Set(
      [
        ...NAV_GROUPS.map((group) => group.slot),
        ...NAV_GROUPS.flatMap((group) =>
          (group.links ?? []).map((link) => link.slot),
        ),
      ].filter(Boolean),
    );

    for (const slot of PUBLIC_PAGE_SLOTS) {
      expect(inNav.has(slot.key), `${slot.key} missing from NAV_GROUPS`).toBe(
        true,
      );
    }
  });

  test("every sub-link slot is a registered page-visibility slot", () => {
    const registered = new Set(PUBLIC_PAGE_SLOTS.map((slot) => slot.key));

    for (const group of NAV_GROUPS) {
      for (const link of group.links ?? []) {
        if (!link.slot) continue;
        expect(
          registered.has(link.slot),
          `${group.label} > ${link.label} -> ${link.slot}`,
        ).toBe(true);
      }
    }
  });

  test("every group has a landing page href", () => {
    for (const group of NAV_GROUPS) {
      expect(group.href.startsWith("/"), group.label).toBe(true);
    }
  });

  // A NavigationMenuTrigger opens its panel instead of navigating, so a group
  // whose landing page is a distinct page needs it listed as a child or the
  // page is unreachable from the nav. /about and /gears are exempt: both
  // redirect to a child that is already listed.
  test("a dropdown group reaches its own landing page", () => {
    const redirectsToAChild = ["/about", "/gears"];

    for (const group of NAV_GROUPS) {
      if (!group.links || redirectsToAChild.includes(group.href)) continue;
      const hrefs = group.links.map((link) => link.href);
      expect(hrefs, `${group.label} never links to ${group.href}`).toContain(
        group.href,
      );
    }
  });

  test("no group links to the same page twice", () => {
    for (const group of NAV_GROUPS) {
      if (!group.links) continue;
      const hrefs = group.links.map((link) => link.href);
      expect(new Set(hrefs).size, `${group.label} has duplicate hrefs`).toBe(
        hrefs.length,
      );
    }
  });

  // The four #anchor entries into /gears/donate presented one page as four
  // destinations; collapsing them is why the Gear menu is three items.
  test("no group links to a fragment of another page", () => {
    for (const group of NAV_GROUPS) {
      for (const link of group.links ?? []) {
        expect(link.href, `${group.label} > ${link.label}`).not.toContain("#");
      }
    }
  });

  test("Home is not a nav item -- the logo already links there", () => {
    expect(NAV_GROUPS.some((group) => group.href === "/home")).toBe(false);
  });
});

describe("visibleGroups", () => {
  test("returns every group when nothing is hidden", () => {
    expect(visibleGroups([])).toHaveLength(NAV_GROUPS.length);
  });

  test("drops the groups the board has hidden", () => {
    const labels = visibleGroups(HIDDEN).map((group) => group.label);

    expect(labels).toEqual(["Events", "Gear", "Get Involved", "Contact"]);
  });

  // The reduced nav still has to reach the section landing pages.
  test("keeps the overview link when a group survives filtering", () => {
    const getInvolved = visibleGroups(HIDDEN).find(
      (group) => group.label === "Get Involved",
    );

    expect(getInvolved?.links?.map((link) => link.href)).toContain(
      "/get-involved",
    );
  });

  test("drops a group whose sub-links are all hidden", () => {
    const groups = visibleGroups([]).map((group) => ({ ...group }));
    expect(groups.some((group) => group.links?.length === 0)).toBe(false);
  });

  test("does not mutate NAV_GROUPS", () => {
    const before = JSON.stringify(NAV_GROUPS);
    visibleGroups(HIDDEN);
    expect(JSON.stringify(NAV_GROUPS)).toBe(before);
  });
});

describe("LEGAL_LINKS", () => {
  test("links to the privacy policy and the terms of use", () => {
    const hrefs = LEGAL_LINKS.map((link) => link.href);
    expect(hrefs).toContain("/privacy");
    expect(hrefs).toContain("/terms");
  });

  // The whole point of these links is that the board can't hide them and the
  // header doesn't carry them -- a slot, or a duplicate NAV_GROUPS entry,
  // would undo one or the other.
  test("carries no visibility slot", () => {
    for (const link of LEGAL_LINKS) {
      expect(link.slot, link.label).toBeUndefined();
    }
  });

  test("does not duplicate a nav destination", () => {
    const navHrefs = new Set([
      ...NAV_GROUPS.map((group) => group.href),
      ...NAV_GROUPS.flatMap((group) =>
        (group.links ?? []).map((link) => link.href),
      ),
    ]);

    for (const link of LEGAL_LINKS) {
      expect(
        navHrefs.has(link.href),
        `${link.label} is already in the nav`,
      ).toBe(false);
    }
  });
});

describe("slotsForHref", () => {
  test("resolves a section landing page and its children to that slot", () => {
    expect(slotsForHref("/programs")).toEqual(["programs"]);
    expect(slotsForHref("/learn/getting-started")).toEqual(["learn"]);
    expect(slotsForHref("/gears/library")).toEqual(["gears"]);
  });

  // The sizing guide lives under Gear and has its own slot, so it depends on
  // both -- hiding either has to take the link with it.
  test("returns a nested slot alongside its parent", () => {
    expect(slotsForHref("/gears/sizing").sort()).toEqual([
      "gears",
      "gears-sizing",
    ]);
  });

  // A prefix match on the raw string would put /gears-something under /gears.
  test("matches on path segments, not on string prefixes", () => {
    expect(slotsForHref("/gears-and-more")).toEqual([]);
  });

  test("an in-page anchor and an ungated route belong to no slot", () => {
    expect(slotsForHref("#buying-vs-renting")).toEqual([]);
    expect(slotsForHref("/privacy")).toEqual([]);
  });
});

describe("isHrefVisible", () => {
  test("keeps a link into a live section", () => {
    expect(isHrefVisible(HIDDEN, "/gears/sizing")).toBe(true);
  });

  test("drops a link into a hidden section", () => {
    expect(isHrefVisible(HIDDEN, "/programs")).toBe(false);
    expect(isHrefVisible(HIDDEN, "/learn/gear-care")).toBe(false);
  });

  test("drops a link whose own slot is hidden even though its parent is live", () => {
    expect(isHrefVisible(["gears-sizing"], "/gears/sizing")).toBe(false);
    expect(isHrefVisible(["gears-sizing"], "/gears/library")).toBe(true);
  });

  test("drops a link whose parent section is hidden even though its own slot is live", () => {
    expect(isHrefVisible(["gears"], "/gears/sizing")).toBe(false);
  });

  test("never drops an anchor or an ungated route", () => {
    expect(isHrefVisible(HIDDEN, "#used-and-secondhand-gear")).toBe(true);
    expect(isHrefVisible(HIDDEN, "/privacy")).toBe(true);
  });
});

describe("isSlotVisible", () => {
  test("gates the header CTA on the section it points at", () => {
    expect(isSlotVisible(HIDDEN, "events")).toBe(true);
    expect(isSlotVisible([...HIDDEN, "events"], "events")).toBe(false);
  });
});
