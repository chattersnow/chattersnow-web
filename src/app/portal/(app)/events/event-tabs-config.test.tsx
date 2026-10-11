// Which cards the event detail page offers, and to whom (#903).
//
// The card catalog used to be a module-level constant holding all seventeen
// cards, and four of them read another section's tables: Expenses and Revenue
// on `event_expenses` / `event_revenue`, Donations on `finance`, Distributions
// on `inventory`. Their server actions always refused a reader without that
// access, so the cards simply came back empty -- and once #900 put
// `event_expenses` and `event_revenue` in the **Finance** module, a tenant that
// was never sold Finance got an Expenses card and an "Add expense" button that
// could not work. This file is the guard on that.
import { describe, expect, test } from "bun:test";
import type { PermissionLevel, PermissionMap } from "@/lib/auth/permissions";
import {
  EVENT_GROUPS,
  LEGACY_PHASE_CARDS,
  TAB_CONFIG,
  eventGroups,
  type TabValue,
} from "./event-tabs-config";

/** Everything the catalog knows about, at `manage`. */
const FULL_ACCESS: PermissionMap = Object.fromEntries(
  [
    "events",
    "finance",
    "event_expenses",
    "event_revenue",
    "sales",
    "inventory",
    "inventory_reports",
  ].map((resource) => [resource, "manage" as PermissionLevel]),
);

function without(...resources: string[]): PermissionMap {
  const map = { ...FULL_ACCESS };
  for (const resource of resources) map[resource] = "none";
  return map;
}

function cards(permissions: PermissionMap): TabValue[] {
  return eventGroups(permissions).flatMap((group) =>
    group.tabs.map((tab) => tab.value),
  );
}

function titles(permissions: PermissionMap): string[] {
  return eventGroups(permissions).flatMap((group) =>
    group.tabs.map((tab) => tab.label),
  );
}

describe("eventGroups", () => {
  test("an admin holding everything gets every card in the catalog", () => {
    expect(cards(FULL_ACCESS)).toEqual(TAB_CONFIG.map((entry) => entry.value));
  });

  test("Finance off takes the Expenses, Revenue, Sales and Donations cards", () => {
    // The four resources a tenant loses when the Finance module is disabled --
    // `sales` joined them in #907: my_permissions() reports `none` for each,
    // whatever the matrix says.
    const visible = cards(
      without("finance", "event_expenses", "event_revenue", "sales"),
    );

    expect(visible).not.toContain("expenses");
    expect(visible).not.toContain("revenue");
    expect(visible).not.toContain("sales");
    expect(visible).not.toContain("donations");

    // And nothing else moves -- the event's own cards are untouched.
    expect(visible).toContain("overview");
    expect(visible).toContain("report");
    expect(visible).toContain("impact");
    expect(visible).toContain("distributions");
  });

  test("Inventory off takes the Distributions card and leaves the rest", () => {
    const visible = cards(without("inventory", "inventory_reports"));
    expect(visible).not.toContain("distributions");
    expect(visible).toContain("giveaway");
    expect(visible).toContain("expenses");
  });

  test("either half of a two-resource gate is enough", () => {
    // Distributions matches listEventDistributionsAction, which takes
    // inventory:manage OR inventory_reports:view. A board member holding only
    // the read-only report permission still gets the card.
    expect(cards(without("inventory"))).toContain("distributions");
  });

  test("every group the rail lists has at least one card in it", () => {
    // A reader with nothing but the events access the route layout requires.
    const eventsOnly: PermissionMap = { events: "view" };
    for (const group of eventGroups(eventsOnly)) {
      expect(group.tabs.length).toBeGreaterThan(0);
    }
    // Money holds only Finance cards, so it drops out rather than standing
    // empty; every other group keeps an ungated card.
    expect(eventGroups(eventsOnly).map((group) => group.key)).toEqual([
      "overview",
      "guests",
      "team",
      "goods",
      "operations",
      "results",
    ]);
  });

  test("lists the catalog in group order", () => {
    // eventGroups() walks EVENT_GROUPS, so a card listed out of its group's
    // place in TAB_CONFIG would still render in order -- but `visible[0]` and
    // FORM_TAB_VALUES read the catalog's own order, so keep the two aligned.
    const order = EVENT_GROUPS.map((group) => group.key);
    const positions = TAB_CONFIG.map((entry) => order.indexOf(entry.group));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  test("lands each legacy ?phase= link on a card every reader can see", () => {
    const visible = cards({ events: "view" });
    for (const card of Object.values(LEGACY_PHASE_CARDS)) {
      expect(visible).toContain(card);
    }
  });

  test("carries each card's display title, not its bare catalog label", () => {
    // The rail row and the card heading it opens have to read the same, and
    // two of them differ from the label: "Overview" is also the group heading
    // above it, and "Planning" alone would not say it carries registration.
    const shown = titles(FULL_ACCESS);
    expect(shown).toContain("Event details");
    expect(shown).toContain("Registration & planning");
  });

  test("every declared keyword is lowercase and non-empty", () => {
    // The rail lowercases the query once and compares; a capitalised keyword
    // would simply never match.
    for (const entry of TAB_CONFIG) {
      for (const keyword of entry.keywords ?? []) {
        expect(keyword).toBe(keyword.toLowerCase());
        expect(keyword.trim()).not.toBe("");
      }
    }
  });
});
