import { describe, expect, test } from "bun:test";
import { actorDisplayName, formatRoleLabel, personDisplayName } from "./format";

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
