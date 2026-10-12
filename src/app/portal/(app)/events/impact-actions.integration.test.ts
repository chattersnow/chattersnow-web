// Integration test: exercises the real event impact Server Actions against a
// real local Supabase stack (checkPermission, then real
// `event_impact_notes` RLS). `event_impact` is its own resource
// (20260823110000) and is the one events-adjacent surface board can read:
// admin/event_coordinator manage, finance/board view, volunteer none -- the
// exact inverse of the volunteer/board split on the shared `events`
// resource, which is what makes it worth covering separately.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  anonClient,
  createPublishedEvent,
  signInAs,
} from "../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { getEventImpactAction, upsertEventImpactAction } =
  await import("./impact-actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

// Since #1588 only the notes are written; the typed figures are archived.
function impactForm(notes = "Strong beginner turnout") {
  const fd = new FormData();
  fd.set("notes", notes);
  // A stale client still posting a typed figure must not reach the row.
  fd.set("firstTimeRiders", "99");
  return fd;
}

const DENIED = { error: "You don't have permission to perform this action." };

async function seedImpact(eventId: string) {
  currentSupabase = await signInAs(SEEDED_USERS.admin);
  const result = await upsertEventImpactAction(eventId, impactForm());
  if ("error" in result) throw new Error(result.error);
}

async function loadNote() {
  const loaded = await getEventImpactAction(currentEventId);
  if (!("data" in loaded)) throw new Error(loaded.error);
  return loaded.data;
}

let currentEventId = "";

describe("event impact actions (integration)", () => {
  test("requires a signed-in user to save impact notes", async () => {
    const event = await createPublishedEvent();
    currentSupabase = anonClient();

    expect(await upsertEventImpactAction(event.id, impactForm())).toEqual({
      error: "You must be signed in to save impact notes.",
    });

    await event.cleanup();
  });

  test("admin role (event_impact manage) can save and re-save impact notes", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    currentEventId = event.id;

    expect(await upsertEventImpactAction(event.id, impactForm())).toEqual({
      success: true,
    });

    const loaded = await loadNote();
    expect(loaded.note?.notes).toBe("Strong beginner turnout");
    expect(loaded.note?.first_time_riders).toBeNull();
    expect(loaded.canManage).toBe(true);

    // Second call takes the on-conflict update path, a separate RLS policy
    // from the insert one.
    expect(
      await upsertEventImpactAction(event.id, impactForm("Revised")),
    ).toEqual({ success: true });
    expect((await loadNote()).note?.notes).toBe("Revised");

    await event.cleanup();
  });

  // #1588: archive, don't drop.
  test("saving notes leaves an event's archived typed figures in place", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    currentEventId = event.id;
    const { error } = await currentSupabase.from("event_impact_notes").insert({
      event_id: event.id,
      first_time_riders: 48,
      rental_subsidies_count: 12,
      assistance_total: 1500.5,
      beginner_pairings_count: 9,
    });
    expect(error).toBeNull();

    expect(
      await upsertEventImpactAction(event.id, impactForm("New notes")),
    ).toEqual({ success: true });

    const loaded = await loadNote();
    expect(loaded.note).toMatchObject({
      notes: "New notes",
      first_time_riders: 48,
      rental_subsidies_count: 12,
      beginner_pairings_count: 9,
    });
    expect(Number(loaded.note?.assistance_total)).toBe(1500.5);

    await event.cleanup();
  });

  test("a submitted report locks the notes until it is reopened", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    await currentSupabase
      .from("events")
      .update({ report_status: "submitted" })
      .eq("id", event.id);

    expect(await upsertEventImpactAction(event.id, impactForm())).toEqual({
      error:
        "This event's report has been submitted. Reopen it to change the notes.",
    });

    await event.cleanup();
  });

  test("returns null rather than an error for an event with no impact row", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await getEventImpactAction(event.id)).toEqual({
      data: { note: null, canView: true, canManage: true },
    });

    await event.cleanup();
  });

  test("event_coordinator role (event_impact manage) can save impact notes", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    expect(await upsertEventImpactAction(event.id, impactForm())).toEqual({
      success: true,
    });

    await event.cleanup();
  });

  test("finance role (event_impact view) can read but not save impact notes", async () => {
    const event = await createPublishedEvent();
    await seedImpact(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.finance);
    currentEventId = event.id;

    const loaded = await loadNote();
    expect(loaded.note?.notes).toBe("Strong beginner turnout");
    expect(loaded.canManage).toBe(false);

    expect(await upsertEventImpactAction(event.id, impactForm())).toEqual(
      DENIED,
    );

    await event.cleanup();
  });

  test("board role (event_impact view, no events access) can read but not save impact notes", async () => {
    const event = await createPublishedEvent();
    await seedImpact(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.board);
    currentEventId = event.id;

    const loaded = await loadNote();
    expect(loaded.note?.notes).toBe("Strong beginner turnout");
    expect(loaded.canManage).toBe(false);

    expect(await upsertEventImpactAction(event.id, impactForm())).toEqual(
      DENIED,
    );

    await event.cleanup();
  });

  test("volunteer role (no event_impact access) can neither read nor save impact notes", async () => {
    const event = await createPublishedEvent();
    await seedImpact(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);

    // The Results card is still theirs; it just has no notes for them.
    expect(await getEventImpactAction(event.id)).toEqual({
      data: { note: null, canView: false, canManage: false },
    });
    expect(await upsertEventImpactAction(event.id, impactForm())).toEqual(
      DENIED,
    );

    await event.cleanup();
  });

  test("a deactivated (former) account cannot save impact notes", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.former);

    expect(await upsertEventImpactAction(event.id, impactForm())).toEqual(
      DENIED,
    );

    await event.cleanup();
  });
});
