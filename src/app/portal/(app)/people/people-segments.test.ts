// The People directory's empty states point at other sections, and since #903
// they may only point at sections this reader can reach.
//
// These segments are role filters on `people` -- a core module -- so every one
// of them stays reachable whatever a tenant was sold. What did not stay
// reachable was the advice: "or approve an application from Volunteers >
// Applications" is a dead end for a tenant whose Volunteers module is off.
import { describe, expect, test } from "bun:test";
import type { PermissionMap } from "@/lib/auth/permissions";
import { DEFAULT_LEXICON } from "@/lib/lexicon";
import {
  DEFAULT_PERSON_ROLE_LABELS,
  DEFAULT_VOCABULARY,
  withPersonRoleTerms,
} from "@/lib/person-roles";
import {
  ATTENDEES_SEGMENT,
  DONORS_SEGMENT,
  PARTNERS_SEGMENT,
  PEOPLE_SEGMENT,
  STAFF_SEGMENT,
  VOLUNTEERS_SEGMENT,
  emptyManageDescription,
  resolveSegment,
  resolveStats,
} from "./people-segments";

const EVERYTHING: PermissionMap = {
  people: "manage",
  inventory: "manage",
  events: "manage",
  volunteers: "manage",
  governance: "manage",
};

/**
 * Every segment is a set of templates until something resolves it (#911), and
 * `emptyManageDescription` is only ever handed a resolved one -- so these read
 * the words, the way the directory does.
 */
const named = (segment: Parameters<typeof resolveSegment>[0]) =>
  resolveSegment(segment, DEFAULT_VOCABULARY);

describe("emptyManageDescription", () => {
  test("appends the hint for a reader who can act on it", () => {
    expect(emptyManageDescription(named(VOLUNTEERS_SEGMENT), EVERYTHING)).toBe(
      "Add the first one with New Volunteer above. You can also approve an application from Volunteers › Applications.",
    );
  });

  test("drops the hint when its section is out of reach", () => {
    const noVolunteers: PermissionMap = { ...EVERYTHING, volunteers: "none" };
    expect(
      emptyManageDescription(named(VOLUNTEERS_SEGMENT), noVolunteers),
    ).toBe("Add the first one with New Volunteer above.");
    // What is left still tells the reader how to add one: the New button is
    // directly above the sentence, so the hint is only ever a second route in.
    expect(
      emptyManageDescription(named(VOLUNTEERS_SEGMENT), noVolunteers),
    ).toContain("New Volunteer");
  });

  test("each segment is gated on the section its own hint names", () => {
    const noInventory: PermissionMap = { ...EVERYTHING, inventory: "none" };
    expect(
      emptyManageDescription(named(DONORS_SEGMENT), noInventory),
    ).not.toContain("Inventory");
    // ...and only that one: Partners names Governance, which is still on.
    expect(
      emptyManageDescription(named(PARTNERS_SEGMENT), noInventory),
    ).toContain("Governance");
  });

  test("a segment with no hint is returned unchanged", () => {
    expect(emptyManageDescription(named(PEOPLE_SEGMENT), {})).toBe(
      PEOPLE_SEGMENT.emptyDescriptionManage,
    );
  });
});

/**
 * #911: donor, sponsor, volunteer, attendee, staff and partner are nonprofit
 * vocabulary, and a studio that runs classes has students and instructors.
 */
describe("resolveSegment", () => {
  /** A studio: classes, instructors, and no fundraising vocabulary at all. */
  const STUDIO = withPersonRoleTerms(DEFAULT_LEXICON, {
    ...DEFAULT_PERSON_ROLE_LABELS,
    is_attendee: { singular: "Student", plural: "Students" },
    is_staff: { singular: "Instructor", plural: "Instructors" },
  });

  test("a tenant that sets nothing reads exactly what it always did", () => {
    const donors = named(DONORS_SEGMENT);

    expect(donors.title).toBe("Donors");
    expect(donors.newPerson?.triggerLabel).toBe("New Donor");
    expect(donors.emptyTitle).toBe("No donors added yet");
    expect(donors.emptyDescriptionManage).toBe(
      "Add the first one with New Donor above.",
    );
    expect(donors.emptyDescriptionView).toBe(
      "Donors appear here once someone is added with the donor role or recorded on a donation.",
    );
    expect(named(STAFF_SEGMENT).newPerson?.triggerLabel).toBe(
      "New Staff Member",
    );
    expect(named(STAFF_SEGMENT).title).toBe("Staff");
  });

  test("the tenant's words reach the heading, the button and both empty states", () => {
    const attendees = resolveSegment(ATTENDEES_SEGMENT, STUDIO);

    expect(attendees.title).toBe("Students");
    expect(attendees.newPerson?.triggerLabel).toBe("New Student");
    expect(attendees.emptyTitle).toBe("No event students yet");
    expect(attendees.emptyDescriptionView).toBe(
      "Students appear here once someone registers for or is checked in at an event.",
    );
  });

  test("the stat tiles are the tenant's words too", () => {
    expect(
      resolveStats(
        [{ label: "Recurring {attendee_plural:lower}", value: 2, caption: "" }],
        STUDIO,
      )[0].label,
    ).toBe("Recurring students");
  });

  // A URL is not a label: renaming routes per tenant buys nothing and breaks
  // every bookmark, every test and the nav tree's own hrefs.
  test("but the route is not renamed", () => {
    expect(resolveSegment(ATTENDEES_SEGMENT, STUDIO).basePath).toBe(
      "/portal/attendees",
    );
    expect(resolveSegment(ATTENDEES_SEGMENT, STUDIO).filterColumn).toBe(
      "is_attendee",
    );
  });

  test("every segment resolves with nothing left standing", () => {
    const unresolved = /\{[a-z_]+(:lower)?\}/;
    for (const segment of [
      PEOPLE_SEGMENT,
      DONORS_SEGMENT,
      PARTNERS_SEGMENT,
      STAFF_SEGMENT,
      ATTENDEES_SEGMENT,
      VOLUNTEERS_SEGMENT,
    ]) {
      const resolved = named(segment);
      for (const value of [
        resolved.title,
        resolved.noun,
        resolved.nounPlural,
        resolved.emptyTitle,
        resolved.emptyDescriptionManage,
        resolved.emptyDescriptionView,
        resolved.newPerson?.triggerLabel ?? "",
        resolved.crossSectionHint?.text ?? "",
      ]) {
        expect(unresolved.test(value), `${segment.basePath}: ${value}`).toBe(
          false,
        );
      }
    }
  });
});
