import { describe, expect, test } from "bun:test";
import type { EventRegistrant } from "../events/registrants-actions";
import {
  cancelledMatches,
  doorCounts,
  doorRows,
  lastNameKey,
} from "./door-list";

function row(
  id: string,
  name: string,
  overrides: Partial<EventRegistrant> = {},
): EventRegistrant {
  return {
    id,
    name,
    email: `${id}@example.test`,
    phone: null,
    party_size: 1,
    checked_in_at: null,
    ...overrides,
  } as EventRegistrant;
}

const list = [
  row("1", "María Fernanda Castillo-Wojciechowski", { party_size: 3 }),
  row("2", "Alex Chen", {
    checked_in_at: "2026-10-10T18:42:00Z",
    party_size: 2,
  }),
  row("3", "jamie abbott", { phone: "555-0199" }),
  row("4", "Prince"),
];

const names = (rows: EventRegistrant[]) => rows.map((r) => r.name);

describe("lastNameKey", () => {
  test("is the last word, hyphenated surnames whole", () => {
    expect(lastNameKey("María Fernanda Castillo-Wojciechowski")).toBe(
      "Castillo-Wojciechowski",
    );
    expect(lastNameKey("  Prince ")).toBe("Prince");
  });
});

describe("doorRows", () => {
  test("Not here is everyone not checked in, by last name", () => {
    expect(names(doorRows(list, "out", ""))).toEqual([
      "jamie abbott",
      "María Fernanda Castillo-Wojciechowski",
      "Prince",
    ]);
  });

  test("In is everyone checked in", () => {
    expect(names(doorRows(list, "in", ""))).toEqual(["Alex Chen"]);
  });

  test("All puts Not here first", () => {
    expect(names(doorRows(list, "all", ""))).toEqual([
      "jamie abbott",
      "María Fernanda Castillo-Wojciechowski",
      "Prince",
      "Alex Chen",
    ]);
  });

  test("a search looks past the tab, at name, email and phone", () => {
    expect(names(doorRows(list, "out", "CHEN"))).toEqual(["Alex Chen"]);
    expect(names(doorRows(list, "in", "0199"))).toEqual(["jamie abbott"]);
    expect(names(doorRows(list, "out", "4@example"))).toEqual(["Prince"]);
  });
});

describe("doorCounts", () => {
  test("counts parties per tab and people overall", () => {
    expect(doorCounts(list)).toEqual({
      out: 3,
      in: 1,
      all: 4,
      peopleIn: 2,
      people: 7,
    });
  });
});

describe("cancelledMatches", () => {
  test("only while searching", () => {
    const cancelled = [row("9", "Sam Gone")];
    expect(cancelledMatches(cancelled, "")).toEqual([]);
    expect(names(cancelledMatches(cancelled, "sam"))).toEqual(["Sam Gone"]);
  });
});
