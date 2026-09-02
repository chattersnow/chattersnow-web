import { describe, expect, test } from "bun:test";
import { rolesFor } from "./people-shared";

describe("rolesFor", () => {
  test("returns an empty list when no roles are set", () => {
    expect(
      rolesFor({
        is_donor: false,
        is_sponsor: false,
        is_volunteer: false,
        is_attendee: false,
      }),
    ).toEqual([]);
  });

  test("returns labels in ROLE_OPTIONS order regardless of which flags are set", () => {
    expect(
      rolesFor({
        is_donor: false,
        is_sponsor: true,
        is_volunteer: true,
        is_attendee: false,
      }),
    ).toEqual(["Sponsor", "Volunteer"]);
  });

  test("returns all labels when every role is set", () => {
    expect(
      rolesFor({
        is_donor: true,
        is_sponsor: true,
        is_volunteer: true,
        is_attendee: true,
      }),
    ).toEqual(["Donor", "Sponsor", "Volunteer", "Attendee"]);
  });
});
