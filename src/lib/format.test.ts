import { describe, expect, test } from "bun:test";
import {
  actorDisplayName,
  formatCalendarDate,
  formatCurrency,
  formatDateTime,
  formatInstantDate,
  formatNumber,
  formatRoleLabel,
  personDisplayName,
} from "./format";

describe("formatRoleLabel", () => {
  test("underscores become spaces and the label is capitalized", () => {
    expect(formatRoleLabel("event_coordinator")).toBe("Event coordinator");
  });

  test("a single-word role is capitalized", () => {
    expect(formatRoleLabel("admin")).toBe("Admin");
  });

  test("an empty string stays empty", () => {
    expect(formatRoleLabel("")).toBe("");
  });
});

describe("personDisplayName", () => {
  test("preferred_name wins over name and email", () => {
    expect(
      personDisplayName({
        preferred_name: "Bex",
        name: "Rebecca Nolan",
        email: "rebecca@example.test",
      }),
    ).toBe("Bex");
  });

  test("name wins over email when there is no preferred_name", () => {
    expect(
      personDisplayName({
        preferred_name: null,
        name: "Rebecca Nolan",
        email: "rebecca@example.test",
      }),
    ).toBe("Rebecca Nolan");
  });

  test("email is used when there is no name", () => {
    expect(
      personDisplayName({
        preferred_name: null,
        name: null,
        email: "r@e.test",
      }),
    ).toBe("r@e.test");
  });

  test("falls back when every field is empty", () => {
    expect(
      personDisplayName({ preferred_name: null, name: null, email: null }),
    ).toBe("—");
  });

  test("null and undefined people use the fallback", () => {
    expect(personDisplayName(null)).toBe("—");
    expect(personDisplayName(undefined)).toBe("—");
  });

  test("a custom fallback is honoured", () => {
    expect(personDisplayName(null, "Unassigned")).toBe("Unassigned");
    expect(personDisplayName({}, "Unassigned")).toBe("Unassigned");
  });

  test("whitespace-only preferred_name falls through to name", () => {
    expect(personDisplayName({ preferred_name: "   ", name: "Dana" })).toBe(
      "Dana",
    );
  });

  test("empty-string preferred_name falls through to name", () => {
    expect(personDisplayName({ preferred_name: "", name: "Dana" })).toBe(
      "Dana",
    );
  });

  test("a missing preferred_name key degrades to name, not to the fallback", () => {
    expect(
      personDisplayName({ name: "Dana", email: "dana@example.test" }),
    ).toBe("Dana");
  });

  test("surrounding whitespace is trimmed off the chosen value", () => {
    expect(personDisplayName({ preferred_name: "  Bex  " })).toBe("Bex");
  });
});

describe("actorDisplayName", () => {
  test("full_name wins over email", () => {
    expect(
      actorDisplayName({ full_name: "Dana Whitfield", email: "d@e.test" }),
    ).toBe("Dana Whitfield");
  });

  test("email is used when there is no full_name", () => {
    expect(actorDisplayName({ full_name: null, email: "d@e.test" })).toBe(
      "d@e.test",
    );
  });

  test("whitespace-only full_name falls through to email", () => {
    expect(actorDisplayName({ full_name: "  ", email: "d@e.test" })).toBe(
      "d@e.test",
    );
  });

  test("a custom fallback stands in for an unresolvable actor", () => {
    expect(actorDisplayName({ full_name: null, email: null }, "user-123")).toBe(
      "user-123",
    );
    expect(actorDisplayName(null, "user-123")).toBe("user-123");
  });
});

describe("date and money formatters", () => {
  test("a date column is never shifted by the viewer's timezone", () => {
    // "2026-03-14" parses as UTC midnight; a zone west of Greenwich would
    // otherwise render it as the 13th.
    expect(formatCalendarDate("2026-03-14")).toBe("Mar 14, 2026");
  });

  test("an instant carries its time", () => {
    const iso = "2026-03-14T15:30:00Z";
    const expected = new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
    expect(formatDateTime(iso)).toBe(expected);
    expect(formatInstantDate(new Date(iso))).toBe(
      new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
        new Date(iso),
      ),
    );
  });

  test("missing or unparseable dates fall back instead of throwing", () => {
    expect(formatCalendarDate(null)).toBe("—");
    expect(formatDateTime(undefined, "n/a")).toBe("n/a");
    expect(formatInstantDate("not a date")).toBe("—");
    expect(formatCalendarDate("")).toBe("—");
  });

  test("currency accepts numbers and numeric strings", () => {
    expect(formatCurrency(1234.5)).toBe("$1,234.50");
    expect(formatCurrency("42")).toBe("$42.00");
    expect(formatCurrency(0)).toBe("$0.00");
  });

  test("currency and counts fall back on missing values", () => {
    expect(formatCurrency(null)).toBe("—");
    expect(formatCurrency("abc")).toBe("—");
    expect(formatNumber(undefined, "0")).toBe("0");
    expect(formatNumber(1234567)).toBe("1,234,567");
  });
});
