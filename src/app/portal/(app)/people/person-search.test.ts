import { describe, expect, test } from "bun:test";
import { filterPeople } from "./person-search";
import type { PersonListItem } from "./actions";

const people: PersonListItem[] = [
  {
    id: "1",
    name: "Jane Doe",
    email: "jane@example.com",
    phone: null,
  },
  {
    id: "2",
    name: "John Smith",
    email: "john@acme.com",
    phone: null,
  },
  {
    id: "3",
    name: null,
    email: "anon@example.com",
    phone: null,
  },
];

describe("filterPeople", () => {
  test("returns no matches for an empty query", () => {
    expect(filterPeople(people, "")).toEqual([]);
  });

  test("returns no matches for a whitespace-only query", () => {
    expect(filterPeople(people, "   ")).toEqual([]);
  });

  test("matches by name case-insensitively", () => {
    expect(filterPeople(people, "jane")).toEqual([people[0]]);
  });

  test("matches by email case-insensitively", () => {
    expect(filterPeople(people, "ACME")).toEqual([people[1]]);
  });

  test("matches a substring anywhere in the field", () => {
    expect(filterPeople(people, "example.com")).toEqual([people[0], people[2]]);
  });

  test("does not throw for a person with a null name", () => {
    expect(filterPeople(people, "anon")).toEqual([people[2]]);
  });

  test("returns an empty array when nothing matches", () => {
    expect(filterPeople(people, "nomatch")).toEqual([]);
  });
});

describe("filterPeople preferred names", () => {
  const withPreferred: PersonListItem[] = [
    {
      id: "p1",
      name: "Rebecca Nolan",
      preferred_name: "Bex",
      email: "rebecca@example.test",
      phone: null,
    },
  ];

  test("matches on the preferred name", () => {
    expect(filterPeople(withPreferred, "bex").map((p) => p.id)).toEqual(["p1"]);
  });

  test("still matches on the legal name", () => {
    expect(filterPeople(withPreferred, "Nolan").map((p) => p.id)).toEqual([
      "p1",
    ]);
  });

  test("still matches on the email", () => {
    expect(filterPeople(withPreferred, "rebecca@").map((p) => p.id)).toEqual([
      "p1",
    ]);
  });

  test("a non-matching query still returns nothing", () => {
    expect(filterPeople(withPreferred, "zzz")).toEqual([]);
  });
});
