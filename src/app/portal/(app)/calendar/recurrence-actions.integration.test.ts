// Integration test: exercises the real recurrence Server Actions against a
// real local Supabase stack (checkPermission, then real `calendar_items` RLS
// -- content_calendar: admin/event_coordinator manage, finance/board/
// volunteer view). The allow case uses its own series (unique series_key,
// starts in 2030) so it can't collide with seeded items, which carry no
// series_key. Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createCalendarItem,
  signInAs,
} from "../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  generateNextYearInstanceAction,
  generateMissingCalendarSeriesInstancesAction,
} = await import("./recurrence-actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const DENIED = { error: "You don't have permission to perform this action." };

// A Tier-1 structured-recurrence series with a single 2030 instance, so the
// next-year generation target (2031) is always missing.
async function createSeriesItem() {
  const seriesKey = crypto.randomUUID();
  const item = await createCalendarItem({
    startsAt: "2030-03-01T12:00:00.000Z",
    priorityTier: 1,
    seriesKey,
    recurrenceStartMonth: 3,
    recurrenceStartDay: 1,
    recurrenceEndMonth: 3,
    recurrenceEndDay: 2,
    recurrenceEndIsMonthEnd: false,
  });
  return {
    ...item,
    seriesKey,
    async cleanupSeries() {
      await adminClient
        .from("calendar_items")
        .delete()
        .eq("series_key", seriesKey);
    },
  };
}

describe("calendar recurrence actions (integration)", () => {
  test("requires a signed-in user to generate an instance", async () => {
    currentSupabase = anonClient();
    expect(await generateNextYearInstanceAction(crypto.randomUUID())).toEqual({
      error: "You must be signed in to generate a calendar item.",
    });
    expect(await generateMissingCalendarSeriesInstancesAction(2031)).toEqual({
      error: "You must be signed in to generate calendar items.",
    });
  });

  test("admin role (content_calendar manage) can generate the next year's instance, once", async () => {
    const series = await createSeriesItem();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await generateNextYearInstanceAction(series.id)).toEqual({
      success: true,
    });

    // The generated instance lands in the same series a year later, reset to
    // idea/internal.
    const { data: instances } = await adminClient
      .from("calendar_items")
      .select("id, starts_at, calendar_status, visibility")
      .eq("series_key", series.seriesKey)
      .order("starts_at", { ascending: true });
    expect(instances).toHaveLength(2);
    expect(instances![1].starts_at.startsWith("2031-03-01")).toBe(true);
    expect(instances![1].calendar_status).toBe("idea");
    expect(instances![1].visibility).toBe("internal");

    // Defensive re-check: a second run must not double-insert.
    expect(await generateNextYearInstanceAction(series.id)).toEqual({
      error: "An instance for 2031 already exists.",
    });

    await series.cleanupSeries();
  });

  test("event_coordinator role (content_calendar manage) can generate the next year's instance", async () => {
    const series = await createSeriesItem();
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    expect(await generateNextYearInstanceAction(series.id)).toEqual({
      success: true,
    });

    await series.cleanupSeries();
  });

  test("finance role (content_calendar view only) cannot generate instances", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.finance);
    expect(await generateNextYearInstanceAction(crypto.randomUUID())).toEqual(
      DENIED,
    );
    expect(await generateMissingCalendarSeriesInstancesAction(2031)).toEqual(
      DENIED,
    );
  });

  test("board role (content_calendar view only) cannot generate instances", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.board);
    expect(await generateNextYearInstanceAction(crypto.randomUUID())).toEqual(
      DENIED,
    );
  });

  test("volunteer role (content_calendar view only) cannot generate instances", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);
    expect(await generateNextYearInstanceAction(crypto.randomUUID())).toEqual(
      DENIED,
    );
    expect(await generateMissingCalendarSeriesInstancesAction(2031)).toEqual(
      DENIED,
    );
  });

  test("a deactivated (former) account cannot generate instances", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.former);
    expect(await generateNextYearInstanceAction(crypto.randomUUID())).toEqual(
      DENIED,
    );
  });
});
