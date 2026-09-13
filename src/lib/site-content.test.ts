import { describe, expect, test } from "bun:test";
import { PUBLIC_PAGE_SLOTS } from "./page-visibility";
import {
  CONTENT_PAGES,
  CONTENT_SECTIONS,
  DEFAULT_SITE_CONTENT,
  IMAGE_SLOT_KEY_PREFIX,
  LEGAL_DOCUMENT_OUTLINES,
  SITE_CONTENT_SLOTS,
  TEAM_PHOTO_FIELD,
  contentSlot,
  imageSlotName,
  isValidSlotValue,
  photoSlotChoices,
  resolvePhoto,
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
      // Unset is the default for both: the platform's document, the placeholder icon.
      if (slot.type === "document" || slot.type === "image") {
        expect(slot.default).toBeNull();
        continue;
      }
      expect(isValidSlotValue(slot, slot.default), slot.key).toBe(true);
    }
  });

  // The inverse of what this asserted until #795 Phase 3, which was that the
  // defaults *were* Chatter Snow's copy. They were, because the registry was
  // extracted from its pages -- so a newly provisioned nonprofit's public site
  // was another organization's, down to real people's names in
  // `about_team.members`. Provisioning copies no site content and `org`,
  // `home`, `contact` and `events` carry no visibility gate, so that was
  // public from the moment the tenant existed.
  //
  // Sweeping every default rather than spot-checking a few: the failure mode
  // is one slot added later carrying the copy it was lifted from, and a
  // spot-check would not see it.
  test("no default names the organization the registry came from", () => {
    for (const slot of SITE_CONTENT_SLOTS) {
      if (slot.type === "document" || slot.type === "image") continue;
      expect(JSON.stringify(slot.default), slot.key).not.toMatch(/chatter/i);
    }
  });

  test("the defaults read as unwritten", () => {
    expect(DEFAULT_SITE_CONTENT.text("home.heading")).toBe(
      "Your headline goes here",
    );
    expect(DEFAULT_SITE_CONTENT.text("org.short_name")).toBe(
      "Your organization",
    );
    // Still unset: the legal pages render their own document until a tenant
    // publishes one deliberately.
    expect(DEFAULT_SITE_CONTENT.document("legal.privacy")).toBeNull();
  });

  // The public pages look a photo up by its short name (`urls.learn_photo`),
  // which `public_site_images` derives by stripping the prefix -- so every
  // image slot must carry it, and nothing else may (#812).
  test("image slots are the site_images.* keys, and only they are", () => {
    const images = SITE_CONTENT_SLOTS.filter((slot) => slot.type === "image");
    expect(images).toHaveLength(28);
    for (const slot of SITE_CONTENT_SLOTS) {
      expect(slot.key.startsWith(IMAGE_SLOT_KEY_PREFIX), slot.key).toBe(
        slot.type === "image",
      );
    }
    const names = images.map((slot) => imageSlotName(slot.key));
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("gear_placeholder");
    expect(names).toContain("about_story_photo");
  });

  // `about_team.members` names a photo slot per person, in the short form the
  // team page reads; a name that matches no slot renders the placeholder with
  // no hint of why.
  test("the default team members point at real image slots", () => {
    const names = new Set(
      SITE_CONTENT_SLOTS.filter((slot) => slot.type === "image").map((slot) =>
        imageSlotName(slot.key),
      ),
    );
    const members = DEFAULT_SITE_CONTENT.list<{ photo_slot?: string }>(
      "about_team.members",
    );
    expect(members.length).toBeGreaterThan(0);
    for (const member of members) {
      if (!member.photo_slot) continue;
      expect(names.has(member.photo_slot), member.photo_slot).toBe(true);
    }
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

  // #917 added `role` to a slot three tenants had already published rows for.
  // Had it been required, every stored member row would have failed validation
  // and the whole slot would have fallen back to the registry's placeholder --
  // a live team page replaced by one fictional person, with nothing to say so.
  test("a team member stored before the role field still validates", () => {
    const slot = contentSlot("about_team.members")!;
    expect(
      isValidSlotValue(slot, [
        { name: "Sam", photo_url: "", photo_slot: "sam", bio: ["Rides."] },
      ]),
    ).toBe(true);
    expect(isValidSlotValue(slot, [{ name: "Sam", role: "Board chair" }])).toBe(
      true,
    );
    expect(isValidSlotValue(slot, [{ name: "Sam", role: 7 }])).toBe(false);
  });

  // `listItemLabel()` names each editor row -- "Move Sam up", "Remove Sam" --
  // by the first `text` field, so the order of these two is behaviour.
  test("name is the first text field of a team member", () => {
    const slot = contentSlot("about_team.members")!;
    const fields = slot.type === "list" ? slot.fields : [];
    expect(fields.find((field) => field.kind === "text")?.key).toBe("name");
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

  test("an image slot holds a URL, and anything else is the placeholder", () => {
    const key = "site_images.learn_photo";
    expect(
      resolveSiteContent([{ key, value: "https://example.test/a.jpg" }]).image(
        key,
      ),
    ).toBe("https://example.test/a.jpg");
    // The old panel stored a cleared slot as "": still "unset" here.
    expect(resolveSiteContent([{ key, value: "" }]).image(key)).toBeNull();
    expect(resolveSiteContent([{ key, value: 42 }]).image(key)).toBeNull();
    expect(DEFAULT_SITE_CONTENT.image(key)).toBeNull();
  });

  test("an image slot refuses a value that is not a renderable src", () => {
    const slot = contentSlot("site_images.learn_photo")!;
    expect(isValidSlotValue(slot, "https://example.test/a.jpg")).toBe(true);
    // Root-relative is how a photo shipped with the app would be named.
    expect(isValidSlotValue(slot, "/images/learn.jpg")).toBe(true);
    // A bare filename is a valid non-empty string and used to pass. The box
    // is `type="url"`, which guards the form submit but not "Publish", so it
    // reached the public site and 404ed against whatever page showed it
    // (#918).
    expect(isValidSlotValue(slot, "learn-photo.jpg")).toBe(false);
    expect(isValidSlotValue(slot, "")).toBe(false);
  });

  test("reading a key as the wrong type is a programming error", () => {
    expect(() => DEFAULT_SITE_CONTENT.paragraphs("home.heading")).toThrow();
    expect(() => DEFAULT_SITE_CONTENT.text("does.not.exist")).toThrow();
  });
});

describe("the links slot's field kinds (#937)", () => {
  const slot = contentSlot("links.items");
  if (!slot || slot.type !== "list") {
    throw new Error("links.items must be a list slot");
  }

  function row(overrides: Record<string, unknown> = {}) {
    return {
      label: "Upcoming events",
      url: "/events",
      description: "Where to find us next.",
      published: true,
      ...overrides,
    };
  }

  test("accepts a well-formed row", () => {
    expect(isValidSlotValue(slot, [row()])).toBe(true);
  });

  test("accepts the destinations isPublishableHref allows", () => {
    for (const url of [
      "https://example.org/give",
      "/get-involved/volunteer",
      "mailto:hello@example.org",
    ]) {
      expect(isValidSlotValue(slot, [row({ url })]), url).toBe(true);
    }
  });

  // The page's whole output is `href`s, so a destination the site would refuse
  // to render must not reach the table in the first place.
  test("refuses a destination the site will not publish", () => {
    for (const url of [
      "javascript:alert(1)",
      "http://example.org",
      "//example.org",
      "example.org",
      "",
    ]) {
      expect(isValidSlotValue(slot, [row({ url })]), url).toBe(false);
    }
  });

  test("a boolean field takes a boolean and nothing else", () => {
    expect(isValidSlotValue(slot, [row({ published: false })])).toBe(true);
    expect(isValidSlotValue(slot, [row({ published: "yes" })])).toBe(false);
    expect(isValidSlotValue(slot, [row({ published: null })])).toBe(false);
  });

  // A row stored before the switch existed has no `published` key. The page
  // treats a missing one as shown, so the validator must not reject the row
  // and send the whole slot back to its default.
  test("a row missing the switch is still valid", () => {
    const legacy = { label: "Donate", url: "/support/donations" };
    expect(isValidSlotValue(slot, [legacy])).toBe(true);
  });

  test("the supporting line is optional and may be blank", () => {
    expect(isValidSlotValue(slot, [row({ description: "" })])).toBe(true);
    const withoutDescription = {
      label: "Donate",
      url: "/support/donations",
      published: true,
    };
    expect(isValidSlotValue(slot, [withoutDescription])).toBe(true);
  });

  test("the registry's own default row survives its own validator", () => {
    expect(isValidSlotValue(slot, slot.default)).toBe(true);
  });
});

describe("a list slot's photo field (#922)", () => {
  const slot = contentSlot("about_team.members");
  if (!slot || slot.type !== "list") {
    throw new Error("about_team.members must be a list slot");
  }
  const imageNames = new Set(
    SITE_CONTENT_SLOTS.filter((entry) => entry.type === "image").map((entry) =>
      imageSlotName(entry.key),
    ),
  );

  function row(overrides: Record<string, unknown> = {}) {
    return {
      name: "Ada Lovelace",
      photo_url: "",
      photo_slot: "",
      bio: ["A short biography."],
      ...overrides,
    };
  }

  // Every part of a photo field names something in the registry: the sibling
  // field it stores the slot in, the slots it offers, and the shared fallback.
  // A prefix that matches nothing is a select with no options, which is the
  // free-text box this replaced with extra steps.
  test("every photo field points at real fields and real slots", () => {
    const photoFields = SITE_CONTENT_SLOTS.flatMap((entry) =>
      entry.type === "list"
        ? entry.fields
            .filter((field) => field.kind === "photo")
            .map((field) => ({ owner: entry, field }))
        : [],
    );
    expect(photoFields.length).toBeGreaterThan(0);
    for (const { owner, field } of photoFields) {
      expect(
        owner.fields.some((sibling) => sibling.key === field.slotField),
        `${owner.key}.${field.key} names sibling ${field.slotField}`,
      ).toBe(true);
      expect(
        imageNames.has(field.fallbackSlot),
        `${owner.key}.${field.key} falls back to ${field.fallbackSlot}`,
      ).toBe(true);
      expect(
        photoSlotChoices(field).length,
        `${owner.key}.${field.key} offers slots matching ${field.slotPrefix}`,
      ).toBeGreaterThan(0);
    }
  });

  test("the choices are the page's own photo slots, not the shared one", () => {
    const names = photoSlotChoices(TEAM_PHOTO_FIELD).map(
      (choice) => choice.name,
    );
    expect(names).toContain("about_team_photo_cass");
    expect(names).not.toContain("about_team_photo");
    expect(names).not.toContain("about_team_hero_photo");
    for (const name of names) expect(imageNames.has(name)).toBe(true);
  });

  test("a link of their own wins, then the slot, then the shared photo", () => {
    const images = {
      about_team_photo_cass: "https://example.test/cass.jpg",
      about_team_photo: "https://example.test/shared.jpg",
    };
    expect(
      resolvePhoto(
        TEAM_PHOTO_FIELD,
        row({
          photo_url: "https://example.test/own.jpg",
          photo_slot: "about_team_photo_cass",
        }),
        images,
      ),
    ).toEqual({ url: "https://example.test/own.jpg", from: "url" });
    expect(
      resolvePhoto(
        TEAM_PHOTO_FIELD,
        row({ photo_slot: "about_team_photo_cass" }),
        images,
      ),
    ).toEqual({
      url: "https://example.test/cass.jpg",
      from: "slot",
      slot: "about_team_photo_cass",
    });
    expect(resolvePhoto(TEAM_PHOTO_FIELD, row(), images)).toEqual({
      url: "https://example.test/shared.jpg",
      from: "fallback",
      slot: "about_team_photo",
    });
  });

  // The old free-text box's failure mode, and the reason the slot is a select
  // now: the page shows the shared photo and nothing says the name was wrong.
  test("a slot that does not exist falls through to the shared photo", () => {
    expect(
      resolvePhoto(
        TEAM_PHOTO_FIELD,
        row({ photo_slot: "about_team_photo_ca" }),
        { about_team_photo: "https://example.test/shared.jpg" },
      ),
    ).toEqual({
      url: "https://example.test/shared.jpg",
      from: "fallback",
      slot: "about_team_photo",
    });
  });

  test("nothing set anywhere is the placeholder icon", () => {
    expect(resolvePhoto(TEAM_PHOTO_FIELD, row(), {})).toEqual({
      url: null,
      from: "none",
    });
  });

  test("a Google Drive share link is resolved, from either source", () => {
    const drive = "https://drive.google.com/file/d/abc123/view";
    const thumbnail = "https://drive.google.com/thumbnail?id=abc123&sz=w1000";
    expect(
      resolvePhoto(TEAM_PHOTO_FIELD, row({ photo_url: drive }), {}).url,
    ).toBe(thumbnail);
    expect(
      resolvePhoto(
        TEAM_PHOTO_FIELD,
        row({ photo_slot: "about_team_photo_cass" }),
        { about_team_photo_cass: drive },
      ).url,
    ).toBe(thumbnail);
  });

  // Blank is the ordinary case -- it means "use the slot instead" -- but a set
  // link has to be something next/image will take, or the page it renders on
  // throws (#918).
  test("the stored link is renderable when set, and may be blank", () => {
    expect(isValidSlotValue(slot, [row()])).toBe(true);
    expect(
      isValidSlotValue(slot, [
        row({ photo_url: "https://example.test/a.jpg" }),
      ]),
    ).toBe(true);
    expect(isValidSlotValue(slot, [row({ photo_url: "/team/ada.jpg" })])).toBe(
      true,
    );
    expect(isValidSlotValue(slot, [row({ photo_url: "ada.jpg" })])).toBe(false);
    expect(isValidSlotValue(slot, [row({ photo_url: null })])).toBe(false);
  });

  test("a row that names neither is still valid", () => {
    expect(isValidSlotValue(slot, [{ name: "Ada Lovelace" }])).toBe(true);
    expect(isValidSlotValue(slot, slot.default)).toBe(true);
  });
});
