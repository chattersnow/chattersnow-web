// Integration test: exercises the real giveaway Server Actions against a real
// local Supabase stack (checkPermission, then real `giveaways` /
// `giveaway_prizes` / `giveaway_winners` RLS). All three tables share the
// `events` resource -- select on events:view, writes on events:manage
// (20260822100000) -- so the interesting cases are the view-only roles
// (finance, volunteer), which can read the giveaway but must not change it.
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
  getEventGiveawayAction,
  upsertEventGiveawayAction,
  createGiveawayPrizeAction,
  deleteGiveawayPrizeAction,
  upsertGiveawayWinnerAction,
} = await import("./giveaway-actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

function giveawayForm() {
  const fd = new FormData();
  fd.set("name", "Season pass giveaway");
  fd.set("ticketsSold", "42");
  fd.set("ticketPrice", "5");
  fd.set("revenueAmount", "210");
  return fd;
}

function prizeForm() {
  const fd = new FormData();
  fd.set("prizeName", "Full-day lift ticket");
  fd.set("estimatedValue", "120");
  return fd;
}

function winnerForm() {
  const fd = new FormData();
  fd.set("winnerName", "Integration Test Winner");
  fd.set("distributionStatus", "distributed");
  return fd;
}

const DENIED = { error: "You don't have permission to perform this action." };

// The giveaway id is only reachable through the read action, which is itself
// permission-gated -- so seed it as admin and hand the id to the caller.
async function seedGiveaway(eventId: string) {
  currentSupabase = await signInAs(SEEDED_USERS.admin);
  await upsertEventGiveawayAction(eventId, giveawayForm());
  const giveaway = await getEventGiveawayAction(eventId);
  if (!("data" in giveaway) || !giveaway.data) {
    throw new Error("expected a seeded giveaway");
  }
  return giveaway.data.id;
}

describe("giveaway actions (integration)", () => {
  test("requires a signed-in user to save a giveaway", async () => {
    const event = await createPublishedEvent();
    currentSupabase = anonClient();

    expect(await upsertEventGiveawayAction(event.id, giveawayForm())).toEqual({
      error: "You must be signed in to update the giveaway.",
    });

    await event.cleanup();
  });

  test("admin role (events manage) can save a giveaway, its prizes, and a winner", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await upsertEventGiveawayAction(event.id, giveawayForm())).toEqual({
      success: true,
    });

    const loaded = await getEventGiveawayAction(event.id);
    if (!("data" in loaded) || !loaded.data) throw new Error("expected data");
    expect(loaded.data.tickets_sold).toBe(42);

    expect(
      await createGiveawayPrizeAction(loaded.data.id, null, prizeForm()),
    ).toEqual({ success: true });

    const withPrize = await getEventGiveawayAction(event.id);
    if (!("data" in withPrize) || !withPrize.data) {
      throw new Error("expected data");
    }
    expect(withPrize.data.giveaway_prizes).toHaveLength(1);
    const prizeId = withPrize.data.giveaway_prizes[0].id;

    expect(await upsertGiveawayWinnerAction(prizeId, winnerForm())).toEqual({
      success: true,
    });

    const withWinner = await getEventGiveawayAction(event.id);
    if (!("data" in withWinner) || !withWinner.data) {
      throw new Error("expected data");
    }
    expect(
      withWinner.data.giveaway_prizes[0].giveaway_winners?.winner_name,
    ).toBe("Integration Test Winner");

    expect(await deleteGiveawayPrizeAction(prizeId)).toEqual({ success: true });

    await event.cleanup();
  });

  test("event_coordinator role (events manage) can save a giveaway", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    expect(await upsertEventGiveawayAction(event.id, giveawayForm())).toEqual({
      success: true,
    });

    await event.cleanup();
  });

  test("finance role (events view only) can read but not write the giveaway", async () => {
    const event = await createPublishedEvent();
    const giveawayId = await seedGiveaway(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.finance);

    const loaded = await getEventGiveawayAction(event.id);
    if (!("data" in loaded) || !loaded.data) throw new Error("expected data");
    expect(loaded.data.id).toBe(giveawayId);

    expect(await upsertEventGiveawayAction(event.id, giveawayForm())).toEqual(
      DENIED,
    );
    expect(
      await createGiveawayPrizeAction(giveawayId, null, prizeForm()),
    ).toEqual(DENIED);
    expect(
      await upsertGiveawayWinnerAction(crypto.randomUUID(), winnerForm()),
    ).toEqual(DENIED);
    expect(await deleteGiveawayPrizeAction(crypto.randomUUID())).toEqual(
      DENIED,
    );

    await event.cleanup();
  });

  test("volunteer role (events view only) can read but not write the giveaway", async () => {
    const event = await createPublishedEvent();
    const giveawayId = await seedGiveaway(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);

    const loaded = await getEventGiveawayAction(event.id);
    if (!("data" in loaded) || !loaded.data) throw new Error("expected data");
    expect(loaded.data.id).toBe(giveawayId);

    expect(await upsertEventGiveawayAction(event.id, giveawayForm())).toEqual(
      DENIED,
    );
    expect(
      await createGiveawayPrizeAction(giveawayId, null, prizeForm()),
    ).toEqual(DENIED);

    await event.cleanup();
  });

  test("board role (no events access) can neither read nor write the giveaway", async () => {
    const event = await createPublishedEvent();
    await seedGiveaway(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.board);

    expect(await getEventGiveawayAction(event.id)).toEqual(DENIED);
    expect(await upsertEventGiveawayAction(event.id, giveawayForm())).toEqual(
      DENIED,
    );

    await event.cleanup();
  });

  test("a deactivated (former) account cannot save a giveaway", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.former);

    expect(await upsertEventGiveawayAction(event.id, giveawayForm())).toEqual(
      DENIED,
    );

    await event.cleanup();
  });
});
