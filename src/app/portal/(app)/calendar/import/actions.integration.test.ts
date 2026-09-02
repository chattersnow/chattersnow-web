// Integration test: exercises the real bulk-import Server Action against a
// real local Supabase stack (checkPermission, then real `calendar_items` RLS
// -- content_calendar: admin/event_coordinator manage, finance/board/
// volunteer view). Requires `bun run db:start && bun run db:reset` first;
// run via `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  signInAs,
} from "../../../../../../test/integration-setup";
import type { CalendarImportRow } from "./calendar-import-row";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { bulkImportCalendarItemsAction } = await import("./actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

function importRow(title: string): CalendarImportRow {
  return {
    title,
    itemType: "community_observance",
    startsAt: "2027-02-01T12:00:00.000Z",
    endsAt: null,
    timeZone: "America/Denver",
    recurrenceRule: null,
    priorityTier: 3,
    category: "lgbtq_community",
    region: null,
  };
}

const DENIED = { error: "You don't have permission to perform this action." };

describe("bulkImportCalendarItemsAction (integration)", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();
    expect(
      await bulkImportCalendarItemsAction("Integration test source", [
        importRow(`Integration test import ${crypto.randomUUID()}`),
      ]),
    ).toEqual({ error: "You must be signed in to import calendar items." });
  });

  test("admin role (content_calendar manage) can import rows", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const title = `Integration test import ${crypto.randomUUID()}`;

    expect(
      await bulkImportCalendarItemsAction("Integration test source", [
        importRow(title),
      ]),
    ).toEqual({ success: true, insertedCount: 1 });

    // Imported rows are force-set to idea/internal regardless of input.
    const { data } = await adminClient
      .from("calendar_items")
      .select("id, calendar_status, visibility, source")
      .eq("title", title)
      .single();
    expect(data?.calendar_status).toBe("idea");
    expect(data?.visibility).toBe("internal");
    expect(data?.source).toBe("Integration test source");

    await adminClient.from("calendar_items").delete().eq("id", data!.id);
  });

  test("event_coordinator role (content_calendar manage) can import rows", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);
    const title = `Integration test import ${crypto.randomUUID()}`;

    expect(
      await bulkImportCalendarItemsAction("Integration test source", [
        importRow(title),
      ]),
    ).toEqual({ success: true, insertedCount: 1 });

    const { data } = await adminClient
      .from("calendar_items")
      .select("id")
      .eq("title", title)
      .single();
    await adminClient.from("calendar_items").delete().eq("id", data!.id);
  });

  test("finance role (content_calendar view only) cannot import", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.finance);
    expect(
      await bulkImportCalendarItemsAction("Integration test source", [
        importRow(`Integration test import ${crypto.randomUUID()}`),
      ]),
    ).toEqual(DENIED);
  });

  test("board role (content_calendar view only) cannot import", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.board);
    expect(
      await bulkImportCalendarItemsAction("Integration test source", [
        importRow(`Integration test import ${crypto.randomUUID()}`),
      ]),
    ).toEqual(DENIED);
  });

  test("volunteer role (content_calendar view only) cannot import", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);
    expect(
      await bulkImportCalendarItemsAction("Integration test source", [
        importRow(`Integration test import ${crypto.randomUUID()}`),
      ]),
    ).toEqual(DENIED);
  });

  test("a deactivated (former) account cannot import", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.former);
    expect(
      await bulkImportCalendarItemsAction("Integration test source", [
        importRow(`Integration test import ${crypto.randomUUID()}`),
      ]),
    ).toEqual(DENIED);
  });
});
