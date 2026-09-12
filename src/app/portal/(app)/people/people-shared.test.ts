import { describe, expect, test } from "bun:test";
import {
  DEFAULT_PERSON_ROLE_LABELS,
  DEFAULT_VOCABULARY,
  withPersonRoleTerms,
} from "@/lib/person-roles";
import { DEFAULT_LEXICON } from "@/lib/lexicon";
import { rolesFor } from "./people-shared";

const NONE = {
  is_donor: false,
  is_sponsor: false,
  is_volunteer: false,
  is_attendee: false,
  is_staff: false,
  is_partner: false,
};

/** An organization that runs classes rather than a charity. */
const STUDIO = withPersonRoleTerms(DEFAULT_LEXICON, {
  ...DEFAULT_PERSON_ROLE_LABELS,
  is_attendee: { singular: "Student", plural: "Students" },
  is_staff: { singular: "Instructor", plural: "Instructors" },
});

describe("rolesFor", () => {
  test("returns an empty list when no roles are set", () => {
    expect(rolesFor(NONE, DEFAULT_VOCABULARY)).toEqual([]);
  });

  test("returns labels in registry order regardless of which flags are set", () => {
    expect(
      rolesFor(
        { ...NONE, is_sponsor: true, is_volunteer: true },
        DEFAULT_VOCABULARY,
      ),
    ).toEqual(["Sponsor", "Volunteer"]);
  });

  test("returns all labels when every role is set", () => {
    expect(
      rolesFor(
        {
          is_donor: true,
          is_sponsor: true,
          is_volunteer: true,
          is_attendee: true,
          is_staff: true,
          is_partner: true,
        },
        DEFAULT_VOCABULARY,
      ),
    ).toEqual([
      "Donor",
      "Sponsor",
      "Volunteer",
      "Attendee",
      "Staff Member",
      "Partner",
    ]);
  });

  // #911: the column is what the tenant calls the role, not what the schema
  // calls the flag.
  test("reads the tenant's words", () => {
    expect(
      rolesFor({ ...NONE, is_attendee: true, is_staff: true }, STUDIO),
    ).toEqual(["Student", "Instructor"]);
  });
});
