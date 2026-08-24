import { describe, expect, test } from "bun:test";
import { filterPeople } from "./person-search";
import type { PersonListItem } from "./actions";

const people: PersonListItem[] = [
  { id: "1", name: "Jane Doe", email: "jane@example.com", phone: null, is_sponsor: false },
  { id: "2", name: "John Smith", email: "john@acme.com", phone: null, is_sponsor: true },
  { id: "3", name: null, email: "anon@example.com", phone: null, is_sponsor: false },
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
