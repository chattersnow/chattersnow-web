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

function impactForm(overrides: { firstTimeRiders?: string } = {}) {
  const fd = new FormData();
  fd.set("firstTimeRiders", overrides.firstTimeRiders ?? "48");
  fd.set("rentalSubsidiesCount", "12");
  fd.set("assistanceTotal", "1500.50");
  fd.set("beginnerPairingsCount", "9");
  fd.set("notes", "Strong beginner turnout");
  return fd;
}

const DENIED = { error: "You don't have permission to perform this action." };

async function seedImpact(eventId: string) {
  currentSupabase = await signInAs(SEEDED_USERS.admin);
  const result = await upsertEventImpactAction(eventId, impactForm());
  if ("error" in result) throw new Error(result.error);
}

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

    expect(await upsertEventImpactAction(event.id, impactForm())).toEqual({
      success: true,
    });

    const loaded = await getEventImpactAction(event.id);
    if (!("data" in loaded) || !loaded.data) throw new Error("expected data");
    expect(loaded.data.first_time_riders).toBe(48);

    // Second call takes the on-conflict update path, a separate RLS policy
    // from the insert one.
    expect(
      await upsertEventImpactAction(
        event.id,
        impactForm({ firstTimeRiders: "51" }),
      ),
    ).toEqual({ success: true });

    const updated = await getEventImpactAction(event.id);
    if (!("data" in updated) || !updated.data) throw new Error("expected data");
    expect(updated.data.first_time_riders).toBe(51);

    await event.cleanup();
  });

  test("returns null rather than an error for an event with no impact row", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await getEventImpactAction(event.id)).toEqual({ data: null });

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

    const loaded = await getEventImpactAction(event.id);
    if (!("data" in loaded) || !loaded.data) throw new Error("expected data");
    expect(loaded.data.first_time_riders).toBe(48);

    expect(await upsertEventImpactAction(event.id, impactForm())).toEqual(
      DENIED,
    );

    await event.cleanup();
  });

  test("board role (event_impact view, no events access) can read but not save impact notes", async () => {
    const event = await createPublishedEvent();
    await seedImpact(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.board);

    const loaded = await getEventImpactAction(event.id);
    if (!("data" in loaded) || !loaded.data) throw new Error("expected data");
    expect(loaded.data.first_time_riders).toBe(48);

    expect(await upsertEventImpactAction(event.id, impactForm())).toEqual(
      DENIED,
    );

    await event.cleanup();
  });

  test("volunteer role (no event_impact access) can neither read nor save impact notes", async () => {
    const event = await createPublishedEvent();
    await seedImpact(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);

    expect(await getEventImpactAction(event.id)).toEqual(DENIED);
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
