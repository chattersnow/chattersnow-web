// Pins the shape of a seeded database (#665).
//
// supabase/seed.sql used to build its bulk data from unseeded random() calls,
// so every `supabase db reset` produced a differently shaped database. Nothing
// caught that -- it surfaced as unexplained variance somewhere downstream,
// most visibly in the a11y scan, where the same commit reported ~3,070, then
// 1,904, then 1,410, then 822 failing color-contrast nodes purely because list
// pages rendered different numbers of rows.
//
// The seed now fixes the PRNG, so this file can assert on counts at all. A
// single run cannot prove determinism by itself; what it does is fail loudly
// the moment the shape drifts -- between a developer's reset and CI's, or
// between two CI jobs -- instead of letting it resurface as a mystery flake.
//
// When you deliberately change the bulk block, these numbers move: re-record
// them from a fresh reset rather than loosening the assertions.
//
// This file describes a *freshly reset* database, which is what CI gives it --
// every job runs `supabase db reset` immediately before the suite. Run the
// suite twice without a reset in between and the counts below are no longer
// the seed's: other files in the suite write to these tables. A count that has
// drifted upward locally usually means a test leaked its fixtures rather than
// that the seed changed.
import { describe, expect, test } from "bun:test";
import { adminClient } from "./integration-setup";
import {
  SEEDED_CALENDAR_IDS,
  SEEDED_DONATION_IDS,
  SEEDED_EVENT_IDS,
  SEEDED_GOVERNANCE_IDS,
  SEEDED_INVENTORY_IDS,
  SEEDED_PERSON_IDS,
  SEEDED_PROGRAM_IDS,
  SEEDED_USER_IDS,
} from "./seed-fixtures";

async function countOf(table: string) {
  const { count, error } = await adminClient
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

// Recorded from a fresh `supabase db reset` on the deterministic seed.
const EXPECTED_COUNTS: Record<string, number> = {
  people: 135,
  events: 58,
  event_registrations: 89,
  donations: 132,
  inventory_items: 254,
  inventory_movements: 410,
  monetary_donations: 93,
  calendar_items: 67,
  governance_meetings: 21,
  volunteer_applications: 47,
  reimbursements: 36,
  discount_codes: 135,
  // Hand-authored rather than drawn (#907), so these two are exact by
  // construction: three products, six variants.
  products: 3,
  product_variants: 6,
};

// contact_messages is deliberately absent. retention.integration.test.ts drives
// run_retention_purge() with an `as_of` two years and a day out, and the purge
// is unscoped -- `delete from contact_messages where created_at < p_as_of -
// v_period` with a two-year period puts the cutoff a day in the future, so it
// removes every row in the table, the 47 seeded ones included. The seeded count
// is real but only holds until that file runs, which makes it a statement about
// test ordering rather than about the seed.

// Every list in the portal whose rows the bulk seed gates behind a draw -- an
// event gets logistics about a third of the time, a sponsor a quarter, a
// giveaway one past event in six. Before the seed was fixed each of these
// could come up empty on a given reset, which is what made "the list is empty"
// an unreliable signal in a test. Deliberately empty tables (bylaws, policies,
// grants, the giveaway tier machinery) are not listed: those are empty every
// run by design, not by dice.
const MUST_NOT_BE_EMPTY = [
  "access_grants",
  "agendas",
  "annual_requirements",
  "board_members",
  "calendar_item_categories",
  "content_opportunities",
  "event_checklist_items",
  "event_expenses",
  "event_impact_notes",
  "event_logistics",
  "event_programs",
  "event_revenue",
  "event_shifts",
  "event_sponsors",
  "event_volunteers",
  "giveaway_prizes",
  "giveaway_winners",
  "giveaways",
  "governance_meeting_action_items",
  "governance_meeting_attendees",
  "governance_meeting_decisions",
  "person_role_tags",
  "programs",
  "resolutions",
  "volunteer_hours",
  "volunteer_role_types",
];

describe("seeded database shape", () => {
  test("headline tables have the recorded row counts", async () => {
    const actual: Record<string, number> = {};
    for (const table of Object.keys(EXPECTED_COUNTS)) {
      actual[table] = await countOf(table);
    }
    expect(actual).toEqual(EXPECTED_COUNTS);
  });

  test("every dice-gated list has at least one row", async () => {
    const empty: string[] = [];
    for (const table of MUST_NOT_BE_EMPTY) {
      if ((await countOf(table)) === 0) empty.push(table);
    }
    expect(empty).toEqual([]);
  });
});

describe("pinned fixture ids", () => {
  test("the eight accounts keep their ids", async () => {
    const { data, error } = await adminClient
      .from("people")
      .select("auth_user_id, email")
      .in("auth_user_id", Object.values(SEEDED_USER_IDS));
    if (error) throw error;

    // volunteer@ and noaccess@ are deliberately left without a people row, so
    // six of the eight resolve here.
    expect(
      Object.fromEntries(
        (data ?? []).map((row) => [row.email, row.auth_user_id]),
      ),
    ).toEqual({
      "admin@example.test": SEEDED_USER_IDS.admin,
      "coordinator@example.test": SEEDED_USER_IDS.coordinator,
      "finance@example.test": SEEDED_USER_IDS.finance,
      "board@example.test": SEEDED_USER_IDS.board,
      "multi@example.test": SEEDED_USER_IDS.multi,
      "former@example.test": SEEDED_USER_IDS.former,
    });
  });

  test("the upcoming event is public, published and still ahead", async () => {
    const { data, error } = await adminClient
      .from("events")
      .select("name, visibility, status, starts_at")
      .eq("id", SEEDED_EVENT_IDS.upcoming)
      .single();
    if (error) throw error;

    expect(data.name).toBe("Winter Gear Swap");
    expect(data.visibility).toBe("public");
    expect(data.status).toBe("published");
    // The a11y scan deep-links to this row, and /events only surfaces public
    // published events -- if it ever drifts into the past the public-facing
    // assertions in e2e/events.spec.ts go with it.
    expect(new Date(data.starts_at).getTime()).toBeGreaterThan(Date.now());
  });

  test("the other named fixtures resolve to the expected records", async () => {
    const lookups: [string, string, string, string][] = [
      [
        "events",
        SEEDED_EVENT_IDS.past,
        "name",
        "Fall Trailhead Cleanup & Giveaway",
      ],
      [
        "events",
        SEEDED_EVENT_IDS.draft,
        "name",
        "Spring Board Planning Session",
      ],
      ["people", SEEDED_PERSON_IDS.donor1, "name", "Jamie Rivera"],
      ["people", SEEDED_PERSON_IDS.donor2, "name", "Alex Chen"],
      ["people", SEEDED_PERSON_IDS.sponsor, "name", "Summit Outdoor Co."],
      ["people", SEEDED_PERSON_IDS.volunteer, "name", "Priya Natarajan"],
      [
        "people",
        SEEDED_PERSON_IDS.localRoasters,
        "name",
        "Local Roasters Coffee",
      ],
      [
        "inventory_items",
        SEEDED_INVENTORY_IDS.jacket,
        "description",
        "Insulated winter jacket",
      ],
      [
        "inventory_items",
        SEEDED_INVENTORY_IDS.beanie,
        "description",
        "Wool beanie",
      ],
      [
        "inventory_movements",
        SEEDED_INVENTORY_IDS.distributedMovement,
        "movement_type",
        "distributed",
      ],
      [
        "calendar_items",
        SEEDED_CALENDAR_IDS.promotion,
        "title",
        "Winter Gear Swap Promotion",
      ],
      [
        "calendar_items",
        SEEDED_CALENDAR_IDS.recurring,
        "title",
        "Sample Recurring Observance",
      ],
      [
        "governance_meetings",
        SEEDED_GOVERNANCE_IDS.meeting,
        "meeting_type",
        "board",
      ],
      [
        "programs",
        SEEDED_PROGRAM_IDS.winterAccess,
        "name",
        "Winter Access Program",
      ],
      [
        "donations",
        SEEDED_DONATION_IDS.withEvent,
        "event_id",
        SEEDED_EVENT_IDS.upcoming,
      ],
    ];

    for (const [table, id, column, expected] of lookups) {
      const { data, error } = await adminClient
        .from(table)
        .select(column)
        .eq("id", id)
        .single();
      if (error) throw new Error(`${table} ${id}: ${error.message}`);
      // The table and column are runtime strings, so the generated row types
      // can't narrow this -- the assertion below is what checks the value.
      const row = data as unknown as Record<string, unknown>;
      expect({
        table,
        value: row[column],
      }).toEqual({
        table,
        value: expected,
      });
    }
  });
});
