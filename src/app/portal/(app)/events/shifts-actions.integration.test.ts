// Integration test: exercises the real event shift Server Actions against a
// real local Supabase stack (checkPermission, then real `event_shifts` RLS).
// `event_shifts` is gated on the shared `events` resource -- select on
// events:view, writes on events:manage (20260824040000) -- so the view-only
// roles (finance, volunteer) reading the schedule but never editing it is
// the case worth pinning down.
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

const {
  listEventShiftsAction,
  createEventShiftAction,
  updateEventShiftAction,
  deleteEventShiftAction,
} = await import("./shifts-actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

function shiftForm(overrides: { label?: string } = {}) {
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
  const fd = new FormData();
  fd.set("label", overrides.label ?? "Morning gear check");
  fd.set("startsAt", start.toISOString());
  fd.set("endsAt", end.toISOString());
  fd.set("targetHeadcount", "3");
  fd.set("notes", "Meet at the rental counter");
  return fd;
}

const DENIED = { error: "You don't have permission to perform this action." };

async function seedShift(eventId: string) {
  currentSupabase = await signInAs(SEEDED_USERS.admin);
  const result = await createEventShiftAction(eventId, shiftForm());
  if ("error" in result) throw new Error(result.error);
}

describe("event shift actions (integration)", () => {
  test("requires a signed-in user to add a shift", async () => {
    const event = await createPublishedEvent();
    currentSupabase = anonClient();

    expect(await createEventShiftAction(event.id, shiftForm())).toEqual({
      error: "You must be signed in to add a shift.",
    });

    await event.cleanup();
  });

  test("admin role (events manage) can create, list, update, and delete a shift", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await createEventShiftAction(event.id, shiftForm())).toEqual({
      success: true,
    });

    const listed = await listEventShiftsAction(event.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0].label).toBe("Morning gear check");
    expect(listed.data[0].target_headcount).toBe(3);

    expect(
      await updateEventShiftAction(
        listed.data[0].id,
        shiftForm({ label: "Afternoon gear check" }),
      ),
    ).toEqual({ success: true });

    const updated = await listEventShiftsAction(event.id);
    if (!("data" in updated)) throw new Error("expected data");
    expect(updated.data[0].label).toBe("Afternoon gear check");

    expect(await deleteEventShiftAction(listed.data[0].id)).toEqual({
      success: true,
    });

    await event.cleanup();
  });

  test("event_coordinator role (events manage) can create a shift", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    expect(await createEventShiftAction(event.id, shiftForm())).toEqual({
      success: true,
    });

    await event.cleanup();
  });

  test("finance role (events view only) can list but not write shifts", async () => {
    const event = await createPublishedEvent();
    await seedShift(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.finance);

    const listed = await listEventShiftsAction(event.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data).toHaveLength(1);

    expect(await createEventShiftAction(event.id, shiftForm())).toEqual(DENIED);
    expect(
      await updateEventShiftAction(listed.data[0].id, shiftForm()),
    ).toEqual(DENIED);
    expect(await deleteEventShiftAction(listed.data[0].id)).toEqual(DENIED);

    await event.cleanup();
  });

  test("volunteer role (events view only) can list but not write shifts", async () => {
    const event = await createPublishedEvent();
    await seedShift(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);

    const listed = await listEventShiftsAction(event.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data).toHaveLength(1);

    expect(await createEventShiftAction(event.id, shiftForm())).toEqual(DENIED);

    await event.cleanup();
  });

  test("board role (no events access) can neither list nor add shifts", async () => {
    const event = await createPublishedEvent();
    await seedShift(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.board);

    expect(await listEventShiftsAction(event.id)).toEqual(DENIED);
    expect(await createEventShiftAction(event.id, shiftForm())).toEqual(DENIED);

    await event.cleanup();
  });

  test("a deactivated (former) account cannot add a shift", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.former);

    expect(await createEventShiftAction(event.id, shiftForm())).toEqual(DENIED);

    await event.cleanup();
  });
});
