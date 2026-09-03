import { describe, expect, test } from "bun:test";
import type { PersonRow, RoleKey } from "../people-shared";
import { aspectsFor, type PersonAspect } from "./types";

// A stand-in registry: keeps this test off the real one, which imports async
// server components (and so next/headers) through its card fields.
const ASPECTS = (
  ["is_donor", "is_sponsor", "is_volunteer", "is_attendee"] as const
).map(
  (key) =>
    ({
      key,
      label: key,
      HistoryCard: () => null,
      actions: [],
    }) as unknown as PersonAspect,
);

function person(flags: Partial<Record<RoleKey, boolean>>) {
  return {
    is_donor: false,
    is_sponsor: false,
    is_volunteer: false,
    is_attendee: false,
    ...flags,
  } as Pick<PersonRow, RoleKey>;
}

describe("aspectsFor", () => {
  test("a person with no roles gets no cards", () => {
    expect(aspectsFor(ASPECTS, person({}))).toEqual([]);
  });

  test("only the roles the person actually holds", () => {
    // Before the registry every card rendered for everybody, so a person who
    // had never donated still got an empty Donations card.
    expect(
      aspectsFor(ASPECTS, person({ is_volunteer: true })).map((a) => a.key),
    ).toEqual(["is_volunteer"]);
  });

  test("someone in several roles gets each one", () => {
    expect(
      aspectsFor(ASPECTS, person({ is_donor: true, is_attendee: true })).map(
        (a) => a.key,
      ),
    ).toEqual(["is_donor", "is_attendee"]);
  });

  test("registry order is preserved, not person-field order", () => {
    expect(
      aspectsFor(
        ASPECTS,
        person({
          is_attendee: true,
          is_donor: true,
          is_sponsor: true,
          is_volunteer: true,
        }),
      ).map((a) => a.key),
    ).toEqual(["is_donor", "is_sponsor", "is_volunteer", "is_attendee"]);
  });
});
