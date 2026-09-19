import { describe, expect, test } from "bun:test";
import {
  agendaSectionSource,
  isSourcedSection,
  isValidSectionKey,
  sectionShowsContentState,
  type AgendaTemplateSection,
} from "./agenda-template-shared";

function section(source?: unknown): AgendaTemplateSection {
  return {
    key: "events",
    label: "Events",
    topics: ["Upcoming events"],
    ...(source === undefined ? {} : { source: source as never }),
  };
}

describe("isValidSectionKey", () => {
  test("accepts the seeded keys and rejects anything else", () => {
    for (const key of ["events", "community_partnerships", "a1_b2"]) {
      expect(isValidSectionKey(key)).toBe(true);
    }
    for (const key of ["", "1events", "Events", "has-dash", "has space"]) {
      expect(isValidSectionKey(key)).toBe(false);
    }
  });
});

describe("agendaSectionSource", () => {
  test("a section with no source is manual", () => {
    expect(agendaSectionSource(section())).toBeUndefined();
    expect(isSourcedSection(section())).toBe(false);
  });

  test("reads the events source", () => {
    expect(agendaSectionSource(section({ kind: "events" }))).toEqual({
      kind: "events",
    });
    expect(isSourcedSection(section({ kind: "events" }))).toBe(true);
  });

  test("reads a calendar source with and without its filters", () => {
    expect(agendaSectionSource(section({ kind: "calendar" }))).toEqual({
      kind: "calendar",
    });
    expect(
      agendaSectionSource(
        section({
          kind: "calendar",
          categories: ["campaigns_fundraising"],
          item_types: ["content_campaign"],
        }),
      ),
    ).toEqual({
      kind: "calendar",
      categories: ["campaigns_fundraising"],
      item_types: ["content_campaign"],
    });
  });

  test("a category key no tenant has is carried through, not rejected", () => {
    // Deactivating a category is ordinary; the feed skips the key. Rejecting
    // the source here would turn a deactivated category into a section that
    // renders the wrong way round.
    expect(
      agendaSectionSource(
        section({ kind: "calendar", categories: ["retired_key"] }),
      ),
    ).toEqual({ kind: "calendar", categories: ["retired_key"] });
  });

  test("an unknown or malformed source falls back to manual", () => {
    for (const source of [
      { kind: "grants" },
      { kind: "" },
      {},
      null,
      "events",
      ["events"],
      42,
      { kind: "calendar", categories: "campaigns_fundraising" },
      { kind: "calendar", categories: [1, 2] },
      { kind: "calendar", item_types: { 0: "partner_event" } },
    ]) {
      expect(agendaSectionSource(section(source))).toBeUndefined();
      expect(isSourcedSection(section(source))).toBe(false);
    }
  });
});

// Which of two calendar-sourced sections shows the content work state (#1243).
// Version 2 seeds both as `{kind: "calendar"}`, so this is what tells
// Marketing & Social's rows from Community & Partnerships'.
describe("sectionShowsContentState", () => {
  const marketing = section({
    kind: "calendar",
    categories: ["campaigns_fundraising"],
    item_types: [
      "content_campaign",
      "content_opportunity",
      "community_observance",
      "heritage_social_justice_moment",
      "winter_outdoor_sports_moment",
    ],
  });
  const community = section({
    kind: "calendar",
    categories: ["partner_opportunities", "community_social_justice"],
    item_types: ["partner_event", "partner_opportunity"],
  });

  test("the section reading content items shows it, the one beside it does not", () => {
    expect(sectionShowsContentState(marketing)).toBe(true);
    expect(sectionShowsContentState(community)).toBe(false);
  });

  test("one content item type is enough", () => {
    expect(
      sectionShowsContentState(
        section({ kind: "calendar", item_types: ["content_opportunity"] }),
      ),
    ).toBe(true);
  });

  test("a section naming no content item type keeps the narrower table", () => {
    for (const source of [
      undefined,
      { kind: "events" },
      { kind: "calendar" },
      { kind: "calendar", categories: ["campaigns_fundraising"] },
      // Malformed, so it is not a calendar source at all.
      { kind: "calendar", item_types: "content_campaign" },
    ]) {
      expect(sectionShowsContentState(section(source))).toBe(false);
    }
  });
});
