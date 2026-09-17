// The snapshot is what a notetaker actually reads during a meeting, and it is
// frozen the moment it is built, so a mistake here is not correctable by
// editing the agenda afterwards. These tests pin the two things that cannot be
// fixed later: the keys, and the tolerance for agenda rows written before the
// structured columns settled.
import { describe, expect, test } from "bun:test";
import {
  MINUTES_SNAPSHOT_VERSION,
  buildMinutesSnapshot,
  isMinutesSnapshot,
  type SnapshotAgenda,
} from "./minutes-snapshot";
import { OPENING_CHECKLIST } from "./opening-checklist";
import type { AgendaTemplateSection } from "./agenda-template-shared";

const SECTIONS: AgendaTemplateSection[] = [
  {
    key: "finance_fundraising",
    label: "Finance & Fundraising",
    topics: ["Current financial position", "Donations and fundraising"],
  },
  { key: "events", label: "Events", topics: ["Upcoming events"] },
];

const FULL_AGENDA: SnapshotAgenda = {
  external_link: "https://example.test/agenda.pdf",
  template_id: "template-1",
  template_version_id: "version-1",
  ongoing_items: {
    finance_fundraising: {
      updates: "Winter drive on track.",
      decisions_needed: "Approve the gear budget.",
    },
    events: { updates: "Swap logistics confirmed.", decisions_needed: "" },
  },
  new_business: ["Q1 grant applications", "Storage unit lease"],
  parking_lot: ["Revisit the lease renewal"],
  upcoming_dates: [
    { date: "2026-04-01", description: "Gear drive", owner: "Board" },
  ],
  next_meeting_date: "2026-04-15",
  next_meeting_topics: "Budget review",
};

function build(agenda: SnapshotAgenda | null, sections = SECTIONS) {
  return buildMinutesSnapshot({
    meetingDate: "2026-03-18T18:00:00.000Z",
    agenda,
    sections,
    openingChecklist: OPENING_CHECKLIST,
  });
}

describe("buildMinutesSnapshot", () => {
  test("turns a fully populated agenda into one ordered item list", () => {
    const snapshot = build(FULL_AGENDA);

    expect(snapshot.version).toBe(MINUTES_SNAPSHOT_VERSION);
    expect(snapshot.meeting_date).toBe("2026-03-18T18:00:00.000Z");
    expect(snapshot.template_id).toBe("template-1");
    expect(snapshot.template_version_id).toBe("version-1");
    expect(snapshot.external_link).toBe("https://example.test/agenda.pdf");

    // The order is the order the meeting runs in, and it is also the export's
    // order and the note keys' order -- one list, not three.
    expect(snapshot.items.map((item) => item.key)).toEqual([
      "opening",
      "carried_over",
      "section:finance_fundraising",
      "section:events",
      "decisions",
      "new_business:0",
      "new_business:1",
      "upcoming_dates",
      "parking_lot",
      "next_meeting",
    ]);

    const finance = snapshot.items.find(
      (item) => item.key === "section:finance_fundraising",
    );
    expect(finance).toMatchObject({
      label: "Finance & Fundraising",
      kind: "section",
      planned: {
        updates: "Winter drive on track.",
        decisions_needed: "Approve the gear budget.",
        topics: ["Current financial position", "Donations and fundraising"],
      },
    });

    expect(
      snapshot.items.find((item) => item.key === "upcoming_dates")?.planned,
    ).toEqual({ topics: ["2026-04-01 — Gear drive — Board"] });
    expect(
      snapshot.items.find((item) => item.key === "next_meeting")?.planned,
    ).toEqual({ text: "2026-04-15 — Budget review" });
    expect(
      snapshot.items.find((item) => item.key === "opening")?.planned?.topics,
    ).toEqual(OPENING_CHECKLIST);
  });

  test("a meeting with no agenda still gets structure from the template alone", () => {
    const snapshot = build(null);

    expect(snapshot.template_id).toBeNull();
    expect(snapshot.template_version_id).toBeNull();
    expect(snapshot.external_link).toBeNull();
    expect(snapshot.items.map((item) => item.key)).toEqual([
      "opening",
      "carried_over",
      "section:finance_fundraising",
      "section:events",
      "decisions",
      // Nothing was planned, so new business is one open place to write rather
      // than nowhere at all.
      "new_business",
      "upcoming_dates",
      "parking_lot",
      "next_meeting",
    ]);
    expect(
      snapshot.items.find((item) => item.key === "section:events")?.planned,
    ).toEqual({
      updates: "",
      decisions_needed: "",
      topics: ["Upcoming events"],
    });
  });

  test("with no template either, the fixed items are still there", () => {
    const snapshot = build(null, []);
    expect(snapshot.items.some((item) => item.kind === "section")).toBe(false);
    expect(snapshot.items).not.toHaveLength(0);
  });

  test("a section key decides its note key, so editing the agenda cannot move it", () => {
    const withMoreBusiness = build({
      ...FULL_AGENDA,
      new_business: ["Q1 grant applications", "Storage unit lease", "A third"],
    });

    // The first two keep the keys they had; the frozen list is what makes the
    // positional key safe.
    expect(withMoreBusiness.items[5]).toMatchObject({
      key: "new_business:0",
      label: "Q1 grant applications",
    });
    expect(withMoreBusiness.items[6]).toMatchObject({
      key: "new_business:1",
      label: "Storage unit lease",
    });
    expect(withMoreBusiness.items[7]).toMatchObject({ key: "new_business:2" });
  });

  test("coerces the legacy seed shapes instead of crashing on them", () => {
    // What supabase/seed.sql wrote until #1199: a bare string per section, and
    // upcoming_dates as a string array. The agenda view renders "—" for both.
    const snapshot = build({
      ...FULL_AGENDA,
      ongoing_items: {
        finance_fundraising: "On track; see winter swap sponsorship.",
        events: 42,
      },
      upcoming_dates: ["Winter Gear Swap — 21 days out"],
      new_business: ["Fine", 7, ""],
      parking_lot: "not a list",
    });

    expect(
      snapshot.items.find((item) => item.key === "section:finance_fundraising")
        ?.planned,
    ).toMatchObject({
      updates: "On track; see winter swap sponsorship.",
      decisions_needed: "",
    });
    expect(
      snapshot.items.find((item) => item.key === "section:events")?.planned,
    ).toMatchObject({ updates: "", decisions_needed: "" });
    // A bare string has no date, description or owner to render.
    expect(
      snapshot.items.find((item) => item.key === "upcoming_dates")?.planned,
    ).toEqual({ topics: [] });
    expect(
      snapshot.items.find((item) => item.key === "parking_lot")?.planned,
    ).toEqual({ topics: [] });
    expect(
      snapshot.items.filter((item) => item.kind === "new_business"),
    ).toEqual([
      {
        key: "new_business:0",
        label: "Fine",
        kind: "new_business",
        planned: { text: "Fine" },
      },
    ]);
  });
});

describe("isMinutesSnapshot", () => {
  test("accepts what the builder produces", () => {
    expect(isMinutesSnapshot(build(FULL_AGENDA))).toBe(true);
    // Round-tripped through the jsonb column.
    expect(isMinutesSnapshot(JSON.parse(JSON.stringify(build(null))))).toBe(
      true,
    );
  });

  test("rejects the shapes a jsonb column can hand back instead", () => {
    expect(isMinutesSnapshot("meeting notes")).toBe(false);
    expect(isMinutesSnapshot([])).toBe(false);
    expect(isMinutesSnapshot(null)).toBe(false);
    expect(isMinutesSnapshot({})).toBe(false);
    expect(isMinutesSnapshot({ ...build(null), items: [{ key: "x" }] })).toBe(
      false,
    );
    expect(
      isMinutesSnapshot({
        ...build(null),
        items: [{ key: "x", label: "X", kind: "not_a_kind" }],
      }),
    ).toBe(false);
  });
});
