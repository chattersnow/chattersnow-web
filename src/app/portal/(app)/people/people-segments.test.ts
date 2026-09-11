// The People directory's empty states point at other sections, and since #903
// they may only point at sections this reader can reach.
//
// These segments are role filters on `people` -- a core module -- so every one
// of them stays reachable whatever a tenant was sold. What did not stay
// reachable was the advice: "or approve an application from Volunteers >
// Applications" is a dead end for a tenant whose Volunteers module is off.
import { describe, expect, test } from "bun:test";
import type { PermissionMap } from "@/lib/auth/permissions";
import {
  DONORS_SEGMENT,
  PARTNERS_SEGMENT,
  PEOPLE_SEGMENT,
  VOLUNTEERS_SEGMENT,
  emptyManageDescription,
} from "./people-segments";

const EVERYTHING: PermissionMap = {
  people: "manage",
  inventory: "manage",
  events: "manage",
  volunteers: "manage",
  governance: "manage",
};

describe("emptyManageDescription", () => {
  test("appends the hint for a reader who can act on it", () => {
    expect(emptyManageDescription(VOLUNTEERS_SEGMENT, EVERYTHING)).toBe(
      "Add the first one with New Volunteer above. You can also approve an application from Volunteers › Applications.",
    );
  });

  test("drops the hint when its section is out of reach", () => {
    const noVolunteers: PermissionMap = { ...EVERYTHING, volunteers: "none" };
    expect(emptyManageDescription(VOLUNTEERS_SEGMENT, noVolunteers)).toBe(
      "Add the first one with New Volunteer above.",
    );
    // What is left still tells the reader how to add one: the New button is
    // directly above the sentence, so the hint is only ever a second route in.
    expect(emptyManageDescription(VOLUNTEERS_SEGMENT, noVolunteers)).toContain(
      "New Volunteer",
    );
  });

  test("each segment is gated on the section its own hint names", () => {
    const noInventory: PermissionMap = { ...EVERYTHING, inventory: "none" };
    expect(emptyManageDescription(DONORS_SEGMENT, noInventory)).not.toContain(
      "Inventory",
    );
    // ...and only that one: Partners names Governance, which is still on.
    expect(emptyManageDescription(PARTNERS_SEGMENT, noInventory)).toContain(
      "Governance",
    );
  });

  test("a segment with no hint is returned unchanged", () => {
    expect(emptyManageDescription(PEOPLE_SEGMENT, {})).toBe(
      PEOPLE_SEGMENT.emptyDescriptionManage,
    );
  });
});
