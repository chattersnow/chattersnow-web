import { describe, expect, test } from "bun:test";
import type { PermissionMap } from "@/lib/auth/permissions";
import { NAV_ITEMS } from "@/lib/portal/nav";
import { ROLE_OPTIONS, type RoleKey } from "../people-shared";
import { ASPECT_ACTIONS } from "./aspect-actions";
import { allowedActions } from "./types";

function labels(key: RoleKey, permissions: PermissionMap) {
  return allowedActions({ actions: ASPECT_ACTIONS[key] }, permissions).map(
    (action) => action.label,
  );
}

const EVERY_KEY = ROLE_OPTIONS.map((option) => option.key);

describe("per-module gating", () => {
  test("no permissions means no actions anywhere", () => {
    for (const key of EVERY_KEY) expect(labels(key, {})).toEqual([]);
  });

  // The point of the registry. Before it, people:manage was the only
  // permission the People pages knew about, so it implicitly authorised
  // everything a person page might offer.
  test("people:manage alone grants nothing", () => {
    for (const key of EVERY_KEY) {
      expect(labels(key, { people: "manage" })).toEqual([]);
    }
  });

  test("each donor action answers to its own module", () => {
    expect(labels("is_donor", { finance: "manage" })).toEqual([
      "Money donations",
    ]);
    expect(labels("is_donor", { inventory_intake: "manage" })).toEqual([
      "Gear donations",
    ]);
    expect(
      labels("is_donor", { finance: "manage", inventory: "view" }),
    ).toEqual(["Money donations", "Gear donations"]);
  });

  test("events owns both sponsor and attendee actions", () => {
    expect(labels("is_sponsor", { events: "view" })).toEqual(["Events"]);
    expect(labels("is_attendee", { events: "view" })).toEqual(["Events"]);
    // finance is a different authority and must not leak across.
    expect(labels("is_sponsor", { finance: "manage" })).toEqual([]);
  });

  test("volunteer work answers to volunteers, not the hours carve-out", () => {
    expect(labels("is_volunteer", { volunteers: "view" })).toEqual([
      "Participation",
    ]);
    // volunteer_hours_logging:manage lets someone log their own hours via the
    // Server Action, but the Volunteers layout still gates the page on
    // volunteers:view -- so the link must not appear for them.
    expect(
      labels("is_volunteer", { volunteer_hours_logging: "manage" }),
    ).toEqual([]);
  });

  test("view does not satisfy an action that wants manage", () => {
    expect(labels("is_donor", { finance: "view" })).toEqual([]);
  });
});

describe("registry coverage", () => {
  test("every person role has an entry", () => {
    // A new role added to ROLE_OPTIONS without actions should fail here
    // rather than silently render a card with nothing to do.
    expect(Object.keys(ASPECT_ACTIONS).sort()).toEqual([...EVERY_KEY].sort());
  });

  test("action keys are unique within an aspect", () => {
    for (const key of EVERY_KEY) {
      const keys = ASPECT_ACTIONS[key].map((action) => action.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

/**
 * A link the viewer cannot open is worse than no link: they land on
 * /portal/home?denied=. These assert each action's gate still matches the gate
 * the sidebar applies to the same destination, so a future nav change can't
 * quietly break that.
 */
describe("route parity with the nav tree", () => {
  function navAccessFor(href: string) {
    for (const item of NAV_ITEMS) {
      if (item.href === href && item.access) return item.access;
      const sub = item.subItems?.find((entry) => entry.href === href);
      if (sub) return sub.access;
    }
    return undefined;
  }

  test("every action's destination is a known nav entry", () => {
    for (const key of EVERY_KEY) {
      for (const action of ASPECT_ACTIONS[key]) {
        expect(navAccessFor(action.href)).toBeDefined();
      }
    }
  });

  test("every action's access matches its destination's", () => {
    for (const key of EVERY_KEY) {
      for (const action of ASPECT_ACTIONS[key]) {
        expect({ href: action.href, access: action.access }).toEqual({
          href: action.href,
          access: navAccessFor(action.href)!,
        });
      }
    }
  });
});
