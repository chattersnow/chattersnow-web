import { describe, expect, test } from "bun:test";
import {
  CONTENT_PAGES,
  DEFAULT_SITE_CONTENT,
  SITE_CONTENT_SLOTS,
  contentSlot,
  isValidSlotValue,
  resolveSiteContent,
} from "./site-content";

describe("the site content registry", () => {
  test("every slot has a unique key on a known page", () => {
    const keys = SITE_CONTENT_SLOTS.map((slot) => slot.key);
    expect(new Set(keys).size).toBe(keys.length);
    const pages = new Set(CONTENT_PAGES.map((page) => page.key));
    for (const slot of SITE_CONTENT_SLOTS) {
      expect(pages.has(slot.page), `${slot.key} is on page ${slot.page}`).toBe(
        true,
      );
    }
  });

  test("every key matches the database check constraint", () => {
    for (const slot of SITE_CONTENT_SLOTS) {
      expect(slot.key).toMatch(/^[a-z0-9_]+(\.[a-z0-9_]+)*$/);
    }
  });

  test("every default has the shape its slot declares", () => {
    for (const slot of SITE_CONTENT_SLOTS) {
      if (slot.type === "document") {
        expect(slot.default).toBeNull();
        continue;
      }
      expect(isValidSlotValue(slot, slot.default), slot.key).toBe(true);
    }
  });

  test("the defaults are Chatter Snow's copy", () => {
    expect(DEFAULT_SITE_CONTENT.text("home.heading")).toBe(
      "A queer ski & snowboard community",
    );
    expect(DEFAULT_SITE_CONTENT.text("org.short_name")).toBe("Chatter");
    expect(DEFAULT_SITE_CONTENT.document("legal.privacy")).toBeNull();
  });
});

describe("resolveSiteContent", () => {
  test("a stored value of the right shape replaces the default", () => {
    const content = resolveSiteContent([
      { key: "home.heading", value: "Ride with us" },
      { key: "about_story.intro", value: ["One.", "Two."] },
      {
        key: "about_mission.values",
        value: [{ name: "Joy", description: "Always." }],
      },
    ]);
    expect(content.text("home.heading")).toBe("Ride with us");
    expect(content.paragraphs("about_story.intro")).toEqual(["One.", "Two."]);
    expect(content.list("about_mission.values")).toEqual([
      { name: "Joy", description: "Always." },
    ]);
    expect(content.overrides).toEqual(
      new Set(["home.heading", "about_story.intro", "about_mission.values"]),
    );
  });

  test("a malformed or unknown row falls back to the default", () => {
    const content = resolveSiteContent([
      { key: "home.heading", value: 42 },
      { key: "about_story.intro", value: "not an array" },
      { key: "about_mission.values", value: [{ name: "Missing description" }] },
      { key: "nope.nothing", value: "x" },
    ]);
    expect(content.text("home.heading")).toBe(
      DEFAULT_SITE_CONTENT.text("home.heading"),
    );
    expect(content.paragraphs("about_story.intro")).toEqual(
      DEFAULT_SITE_CONTENT.paragraphs("about_story.intro"),
    );
    expect(content.list("about_mission.values")).toEqual(
      DEFAULT_SITE_CONTENT.list("about_mission.values"),
    );
    expect(content.overrides.size).toBe(0);
  });

  test("optional list fields may be absent", () => {
    const slot = contentSlot("about_team.members")!;
    expect(isValidSlotValue(slot, [{ name: "Sam" }])).toBe(true);
    expect(isValidSlotValue(slot, [{ name: "Sam", bio: "not a list" }])).toBe(
      false,
    );
  });

  test("a legal document needs a title, a date, a summary and sections", () => {
    const slot = contentSlot("legal.terms")!;
    const doc = {
      title: "Terms",
      last_updated: "January 1, 2030",
      summary: ["Short."],
      sections: [{ id: "one", title: "One", paragraphs: ["First."] }],
    };
    expect(isValidSlotValue(slot, doc)).toBe(true);
    expect(isValidSlotValue(slot, { ...doc, sections: [{ id: "x" }] })).toBe(
      false,
    );
    expect(
      resolveSiteContent([{ key: "legal.terms", value: doc }]).document(
        "legal.terms",
      ),
    ).toEqual(doc);
  });

  test("reading a key as the wrong type is a programming error", () => {
    expect(() => DEFAULT_SITE_CONTENT.paragraphs("home.heading")).toThrow();
    expect(() => DEFAULT_SITE_CONTENT.text("does.not.exist")).toThrow();
  });
});
