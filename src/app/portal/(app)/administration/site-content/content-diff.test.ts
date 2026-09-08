import { describe, expect, test } from "bun:test";
import type { ContentSlot } from "@/lib/site-content";
import { draftValueFor, slotChanges, slotLines } from "./content-diff";

const HEADING: ContentSlot = {
  key: "home.heading",
  page: "home",
  section: "home:hero",
  label: "Heading",
  type: "text",
  default: "A queer ski & snowboard community",
};

const INTRO: ContentSlot = {
  key: "home.intro",
  page: "home",
  section: "home:hero",
  label: "Introduction",
  type: "paragraphs",
  default: ["One.", "Two."],
};

const VALUES: ContentSlot = {
  key: "home.values",
  page: "home",
  section: "home:hero",
  label: "Values",
  type: "list",
  fields: [
    { key: "name", label: "Value", kind: "text" },
    { key: "body", label: "Description", kind: "text" },
  ],
  default: [],
};

const PRIVACY: ContentSlot = {
  key: "legal.privacy",
  page: "legal",
  section: "legal:documents",
  label: "Privacy policy",
  type: "document",
  default: null,
  route: "/privacy",
};

describe("slotLines", () => {
  test("reads each slot shape as the lines a person would read", () => {
    expect(slotLines(HEADING, "Hello")).toEqual(["Hello"]);
    expect(slotLines(INTRO, ["a", "b"])).toEqual(["a", "b"]);
    expect(slotLines(VALUES, [{ name: "Joy", body: "We ride." }])).toEqual([
      "Joy — We ride.",
    ]);
    expect(
      slotLines(PRIVACY, {
        title: "Privacy",
        last_updated: "January 1, 2026",
        summary: ["Short version."],
        sections: [
          { id: "a", title: "What we collect", paragraphs: ["Some."] },
        ],
      }),
    ).toEqual(["Privacy", "Short version.", "What we collect", "Some."]);
  });

  test("an unset slot has no lines rather than a null one", () => {
    expect(slotLines(HEADING, "")).toEqual([]);
    expect(slotLines(PRIVACY, null)).toEqual([]);
    expect(slotLines(INTRO, undefined)).toEqual([]);
  });
});

describe("slotChanges", () => {
  test("keeps what changes and drops what only looks like it did", () => {
    const changes = slotChanges([
      { slot: HEADING, value: "New", published: "Old" },
      { slot: INTRO, value: ["One.", "Two."], published: ["One.", "Two."] },
    ]);

    expect(changes).toHaveLength(1);
    expect(changes[0].slot.key).toBe("home.heading");
    expect(changes[0].before).toEqual(["Old"]);
    expect(changes[0].after).toEqual(["New"]);
  });

  test("marks a change that puts the registry default back", () => {
    const changes = slotChanges([
      { slot: HEADING, value: HEADING.default, published: "Our own words" },
    ]);

    expect(changes[0].toDefault).toBe(true);
  });
});

describe("draftValueFor", () => {
  test("stores a value the tenant wrote", () => {
    expect(draftValueFor(HEADING, "Our own words")).toBe("Our own words");
  });

  test("stores null where the editor is back at the registry default", () => {
    // Otherwise a copy of the shipped default would be saved as if it were
    // the tenant's own words, and would stop tracking the default if it moved.
    expect(draftValueFor(HEADING, HEADING.default)).toBeNull();
    expect(draftValueFor(INTRO, ["One.", "Two."])).toBeNull();
    expect(draftValueFor(PRIVACY, null)).toBeNull();
  });
});
