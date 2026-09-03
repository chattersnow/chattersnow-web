import { describe, expect, test } from "bun:test";
import {
  calendarActorName,
  ownerName,
  ownerOptions,
  type CalendarOwner,
} from "./calendar-shared";

const owners: CalendarOwner[] = [
  {
    person_id: "person-1",
    auth_user_id: "auth-1",
    name: "Avery Morgan",
    preferred_name: "Ave",
    email: "admin@example.test",
  },
  {
    person_id: "person-2",
    auth_user_id: "auth-2",
    name: "Jordan Lee",
    preferred_name: null,
    email: "coordinator@example.test",
  },
];

describe("ownerName", () => {
  test("resolves a people id, preferring the preferred name", () => {
    expect(ownerName(owners, "person-1")).toBe("Ave");
  });

  test("falls back to the legal name when there is no preferred name", () => {
    expect(ownerName(owners, "person-2")).toBe("Jordan Lee");
  });

  test("an unset owner renders the placeholder", () => {
    expect(ownerName(owners, null)).toBe("—");
  });

  test("an owner no longer in the list renders the placeholder", () => {
    expect(ownerName(owners, "person-gone")).toBe("—");
  });

  test("an auth id is NOT resolved as an owner", () => {
    // owner_id references public.people; passing an auth id must not match.
    expect(ownerName(owners, "auth-1")).toBe("—");
  });

  test("a custom fallback is honoured", () => {
    expect(ownerName(owners, null, "Unassigned")).toBe("Unassigned");
  });
});

describe("calendarActorName", () => {
  test("resolves an auth.users id -- the audit stamps stayed on auth.users", () => {
    expect(calendarActorName(owners, "auth-1")).toBe("Ave");
    expect(calendarActorName(owners, "auth-2")).toBe("Jordan Lee");
  });

  test("a people id is NOT resolved as an actor", () => {
    expect(calendarActorName(owners, "person-1")).toBe("—");
  });

  test("null and unknown actors use the fallback", () => {
    expect(calendarActorName(owners, null)).toBe("—");
    expect(
      calendarActorName(owners, "auth-gone", "someone no longer listed"),
    ).toBe("someone no longer listed");
  });
});

describe("ownerOptions", () => {
  test("maps person_id onto the id field PersonSelect expects", () => {
    expect(ownerOptions(owners)).toEqual([
      {
        id: "person-1",
        name: "Avery Morgan",
        preferred_name: "Ave",
        email: "admin@example.test",
      },
      {
        id: "person-2",
        name: "Jordan Lee",
        preferred_name: null,
        email: "coordinator@example.test",
      },
    ]);
  });
});
