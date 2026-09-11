// Which cards the event detail page offers, and to whom (#903).
//
// The phase strip used to be a module-level constant holding all seventeen
// cards, and four of them read another section's tables: Expenses and Revenue
// on `event_expenses` / `event_revenue`, Donations on `finance`, Distributions
// on `inventory`. Their server actions always refused a reader without that
// access, so the cards simply came back empty -- and once #900 put
// `event_expenses` and `event_revenue` in the **Finance** module, a tenant that
// was never sold Finance got an Expenses card and an "Add expense" button that
// could not work. This file is the guard on that.
import { describe, expect, test } from "bun:test";
import type { PermissionLevel, PermissionMap } from "@/lib/auth/permissions";
import { TAB_CONFIG, eventPhases, type TabValue } from "./event-tabs-config";

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
  return eventPhases(permissions).flatMap((phase) =>
    phase.tabs.map((tab) => tab.value),
  );
}

describe("eventPhases", () => {
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

  test("every phase in the strip has at least one card in it", () => {
    // A reader with nothing but the events access the route layout requires.
    const eventsOnly: PermissionMap = { events: "view" };
    for (const phase of eventPhases(eventsOnly)) {
      expect(phase.tabs.length).toBeGreaterThan(0);
    }
    // All four phases survive, which is what lets the deep-link fallback in
    // event-detail-view.tsx keep `basic` as its default.
    expect(eventPhases(eventsOnly).map((phase) => phase.key)).toEqual([
      "basic",
      "planning",
      "during",
      "after",
    ]);
  });

  test("a phase only fetches the shared reads its surviving cards ask for", () => {
    // sharedData is unioned as the cards are collected, so a card that is
    // filtered out must not leave its read behind for the provider to run.
    const full = eventPhases(FULL_ACCESS);
    const reduced = eventPhases(without("finance", "event_expenses"));
    for (const phase of reduced) {
      const same = full.find((candidate) => candidate.key === phase.key)!;
      for (const resource of phase.sharedData) {
        expect(same.sharedData).toContain(resource);
      }
    }
  });
});
