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

const PHOTO: ContentSlot = {
  key: "site_images.home_carousel_1",
  page: "home",
  section: "home:hero",
  label: "Homepage carousel — slide 1",
  type: "image",
  default: null,
  ratio: "21/9",
};

const URL = "https://drive.google.com/file/d/abc123/view";

describe("slotLines", () => {
  test("reads each slot shape as the lines a person would read", () => {
    expect(slotLines(HEADING, "Hello")).toEqual(["Hello"]);
    expect(slotLines(PHOTO, URL)).toEqual([URL]);
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
    expect(slotLines(PHOTO, null)).toEqual([]);
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

  test("clearing a photo reads as a change back to the placeholder", () => {
    const changes = slotChanges([{ slot: PHOTO, value: null, published: URL }]);

    expect(changes).toHaveLength(1);
    expect(changes[0].before).toEqual([URL]);
    expect(changes[0].after).toEqual([]);
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
    expect(draftValueFor(PHOTO, null)).toBeNull();
    expect(draftValueFor(PHOTO, URL)).toBe(URL);
  });
});

const LINKS: ContentSlot = {
  key: "links.items",
  page: "links",
  section: "links:page",
  label: "Links",
  type: "list",
  fields: [
    { key: "label", label: "Button text", kind: "text" },
    { key: "url", label: "Destination", kind: "url" },
    { key: "published", label: "Published", kind: "boolean" },
  ],
  default: [],
};

describe("a list carrying a switch (#937)", () => {
  const on = [{ label: "Events", url: "/events", published: true }];
  const off = [{ label: "Events", url: "/events", published: false }];

  test("names the switch in the line rather than printing a bare value", () => {
    expect(slotLines(LINKS, on)).toEqual(["Events — /events — Published: yes"]);
    expect(slotLines(LINKS, off)).toEqual(["Events — /events — Published: no"]);
  });

  // The bug this guards: `false` fell out of the old truthiness filter, so
  // switching a link off read as "nothing changed" in the publish dialog and
  // went live without ever being listed.
  test("switching a link off is a change the dialog can show", () => {
    const changes = slotChanges([{ slot: LINKS, value: off, published: on }]);

    expect(changes).toHaveLength(1);
    expect(changes[0].before).toEqual(["Events — /events — Published: yes"]);
    expect(changes[0].after).toEqual(["Events — /events — Published: no"]);
  });

  // A row stored before the switch existed has no key for it, and the page
  // reads a missing one as shown. The diff has to say the same thing, or
  // adding the field to an existing row would read as a change to it.
  test("a row with no switch reads as published", () => {
    expect(slotLines(LINKS, [{ label: "Events", url: "/events" }])).toEqual([
      "Events — /events — Published: yes",
    ]);
  });
});
