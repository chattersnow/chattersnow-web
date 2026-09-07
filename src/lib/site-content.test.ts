import { describe, expect, test } from "bun:test";
import { PUBLIC_PAGE_SLOTS } from "./page-visibility";
import {
  CONTENT_PAGES,
  CONTENT_SECTIONS,
  DEFAULT_SITE_CONTENT,
  LEGAL_DOCUMENT_OUTLINES,
  SITE_CONTENT_SLOTS,
  contentSlot,
  isValidSlotValue,
  resolveSiteContent,
  sectionsForPage,
  slotsForSection,
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

  test("a page's visibility key names a real page-visibility slot", () => {
    const slots = new Set(PUBLIC_PAGE_SLOTS.map((slot) => slot.key));
    for (const page of CONTENT_PAGES) {
      if (!page.visibilityKey) continue;
      expect(slots.has(page.visibilityKey), page.key).toBe(true);
    }
  });
});

describe("content sections", () => {
  test("every section has a unique key on a known page", () => {
    const keys = CONTENT_SECTIONS.map((section) => section.key);
    expect(new Set(keys).size).toBe(keys.length);
    const pages = new Set(CONTENT_PAGES.map((page) => page.key));
    for (const section of CONTENT_SECTIONS) {
      expect(pages.has(section.page), section.key).toBe(true);
    }
  });

  test("every slot belongs to a section on its own page", () => {
    const sections = new Map(CONTENT_SECTIONS.map((s) => [s.key, s]));
    for (const slot of SITE_CONTENT_SLOTS) {
      const section = sections.get(slot.section);
      expect(
        section,
        `${slot.key} is in section ${slot.section}`,
      ).toBeDefined();
      expect(section?.page, slot.key).toBe(slot.page);
    }
  });

  // An empty section renders a card with nothing in it, which only ever means
  // a slot was moved or removed and its section left behind.
  test("every section owns at least one slot", () => {
    for (const section of CONTENT_SECTIONS) {
      expect(slotsForSection(section.key).length, section.key).toBeGreaterThan(
        0,
      );
    }
  });

  // Sections and slots are looked up from the same strings in the editor, so a
  // key that is both would make an outline entry ambiguous.
  test("no section key is also a slot key", () => {
    const slotKeys = new Set(SITE_CONTENT_SLOTS.map((slot) => slot.key));
    for (const section of CONTENT_SECTIONS) {
      expect(slotKeys.has(section.key), section.key).toBe(false);
    }
  });

  test("sectionsForPage returns the page's sections in registry order", () => {
    expect(sectionsForPage("support").map((s) => s.key)).toEqual([
      "support:opening",
      "support:donations",
      "support:sponsorship",
    ]);
    expect(sectionsForPage("nope")).toEqual([]);
  });

  // The whole point of a per-section route: `support` alone spans three public
  // routes, so the page's own route is the wrong link for two of them.
  test("a section's route overrides the page's where they differ", () => {
    const section = CONTENT_SECTIONS.find(
      (s) => s.key === "get_involved:volunteer",
    );
    expect(section?.route).toBe("/get-involved/volunteer");
    expect(
      CONTENT_SECTIONS.find((s) => s.key === "get_involved:sponsor")?.route,
    ).toBeUndefined();
  });
});

describe("legal document outlines", () => {
  test("every document slot has an outline", () => {
    for (const slot of SITE_CONTENT_SLOTS) {
      if (slot.type !== "document") continue;
      const outline = LEGAL_DOCUMENT_OUTLINES[slot.key];
      expect(outline, slot.key).toBeDefined();
      expect(outline.title.length, slot.key).toBeGreaterThan(0);
      expect(outline.sections.length, slot.key).toBeGreaterThan(0);
    }
  });

  test("no outline exists for a slot that is not a document", () => {
    const documents = new Set(
      SITE_CONTENT_SLOTS.filter((slot) => slot.type === "document").map(
        (slot) => slot.key,
      ),
    );
    for (const key of Object.keys(LEGAL_DOCUMENT_OUTLINES)) {
      expect(documents.has(key), key).toBe(true);
    }
  });

  // The ids are anchor targets on the published page as well as the seed the
  // editor offers, so a duplicate would send two nav links to the same place.
  test("section ids are unique within a document", () => {
    for (const [key, outline] of Object.entries(LEGAL_DOCUMENT_OUTLINES)) {
      const ids = outline.sections.map((section) => section.id);
      expect(new Set(ids).size, key).toBe(ids.length);
    }
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
