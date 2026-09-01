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
  adminClient,
  anonClient,
  createDonation,
  createMonetaryDonation,
  createPublishedEvent,
  getInventoryItemStatus,
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
  updateGiveawayPrizeAction,
  deleteGiveawayPrizeAction,
  listAvailableGiveawaySourcesAction,
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

// An in-kind donation attributed to `eventId`, plus the inventory item it
// produced. list_available_giveaway_sources only offers donations tied to the
// event, and createDonation() makes an unattributed one, so the event id is
// set afterwards.
async function seedEventDonation(eventId: string) {
  const donation = await createDonation();
  await adminClient
    .from("donations")
    .update({ event_id: eventId })
    .eq("id", donation.id);

  const { data, error } = await adminClient
    .from("inventory_items")
    .select("id")
    .eq("donation_id", donation.id)
    .single();
  if (error) throw error;

  return { itemId: data.id as string, cleanup: donation.cleanup };
}

async function prizesFor(eventId: string) {
  const loaded = await getEventGiveawayAction(eventId);
  if (!("data" in loaded) || !loaded.data) throw new Error("expected data");
  return loaded.data.giveaway_prizes;
}

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

  // Issue #570: linking a prize to an in-kind donation used to write only the
  // FK, leaving the inventory item 'available' -- so the same physical item
  // stayed in the distribution picker and the public gear catalog.
  test("linking a prize to an inventory item reserves it, and removing the prize releases it", async () => {
    const event = await createPublishedEvent();
    const donation = await seedEventDonation(event.id);
    const giveawayId = await seedGiveaway(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await getInventoryItemStatus(donation.itemId)).toBe("available");

    expect(
      await createGiveawayPrizeAction(
        giveawayId,
        null,
        prizeForm(),
        donation.itemId,
      ),
    ).toEqual({ success: true });

    expect(await getInventoryItemStatus(donation.itemId)).toBe("reserved");

    const prizes = await prizesFor(event.id);
    expect(prizes).toHaveLength(1);
    expect(prizes[0].source_inventory_item_id).toBe(donation.itemId);

    expect(await deleteGiveawayPrizeAction(prizes[0].id)).toEqual({
      success: true,
    });

    expect(await getInventoryItemStatus(donation.itemId)).toBe("available");

    await donation.cleanup();
    await event.cleanup();
  });

  test("changing a prize's source releases the old item and reserves the new one", async () => {
    const event = await createPublishedEvent();
    const first = await seedEventDonation(event.id);
    const second = await seedEventDonation(event.id);
    const giveawayId = await seedGiveaway(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    await createGiveawayPrizeAction(
      giveawayId,
      null,
      prizeForm(),
      first.itemId,
    );
    const [prize] = await prizesFor(event.id);

    expect(
      await updateGiveawayPrizeAction(
        prize.id,
        null,
        prizeForm(),
        second.itemId,
      ),
    ).toEqual({ success: true });

    expect(await getInventoryItemStatus(first.itemId)).toBe("available");
    expect(await getInventoryItemStatus(second.itemId)).toBe("reserved");

    // Clearing the source entirely releases the item too.
    expect(
      await updateGiveawayPrizeAction(prize.id, null, prizeForm()),
    ).toEqual({ success: true });
    expect(await getInventoryItemStatus(second.itemId)).toBe("available");

    const [updated] = await prizesFor(event.id);
    expect(updated.source_inventory_item_id).toBeNull();

    await deleteGiveawayPrizeAction(prize.id);
    await first.cleanup();
    await second.cleanup();
    await event.cleanup();
  });

  test("an unchanged source survives an edit that only touches other fields", async () => {
    const event = await createPublishedEvent();
    const donation = await seedEventDonation(event.id);
    const giveawayId = await seedGiveaway(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    await createGiveawayPrizeAction(
      giveawayId,
      null,
      prizeForm(),
      donation.itemId,
    );
    const [prize] = await prizesFor(event.id);

    const renamed = prizeForm();
    renamed.set("prizeName", "Renamed prize");
    expect(
      await updateGiveawayPrizeAction(prize.id, null, renamed, donation.itemId),
    ).toEqual({ success: true });

    // The release/reserve pair is skipped when the source is unchanged --
    // reserving an already-reserved item would otherwise fail.
    expect(await getInventoryItemStatus(donation.itemId)).toBe("reserved");
    const [updated] = await prizesFor(event.id);
    expect(updated.prize_name).toBe("Renamed prize");
    expect(updated.source_inventory_item_id).toBe(donation.itemId);

    await deleteGiveawayPrizeAction(prize.id);
    await donation.cleanup();
    await event.cleanup();
  });

  test("an item that is no longer available cannot be linked to a prize", async () => {
    const event = await createPublishedEvent();
    const donation = await seedEventDonation(event.id);
    const giveawayId = await seedGiveaway(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    await adminClient
      .from("inventory_items")
      .update({ status: "distributed" })
      .eq("id", donation.itemId);

    const result = await createGiveawayPrizeAction(
      giveawayId,
      null,
      prizeForm(),
      donation.itemId,
    );
    expect(result).toEqual({
      error:
        "That donation is no longer available — it may have been used for another prize or distributed. Refresh and pick another.",
    });

    // The whole write rolls back: no orphan prize, and the item is untouched.
    expect(await prizesFor(event.id)).toHaveLength(0);
    expect(await getInventoryItemStatus(donation.itemId)).toBe("distributed");

    await donation.cleanup();
    await event.cleanup();
  });

  test("the source list hides linked donations, except the prize being edited", async () => {
    const event = await createPublishedEvent();
    const donation = await seedEventDonation(event.id);
    const gift = await createMonetaryDonation({ eventId: event.id });
    const giveawayId = await seedGiveaway(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    const before = await listAvailableGiveawaySourcesAction(event.id);
    if (!("data" in before)) throw new Error("expected data");
    expect(before.data.inventoryItems.map((i) => i.id)).toContain(
      donation.itemId,
    );
    expect(before.data.monetaryDonations.map((d) => d.id)).toContain(gift.id);

    await createGiveawayPrizeAction(
      giveawayId,
      null,
      prizeForm(),
      donation.itemId,
    );
    const [prize] = await prizesFor(event.id);

    // Adding another prize must not offer the item this one already uses.
    const forAdd = await listAvailableGiveawaySourcesAction(event.id);
    if (!("data" in forAdd)) throw new Error("expected data");
    expect(forAdd.data.inventoryItems.map((i) => i.id)).not.toContain(
      donation.itemId,
    );

    // Editing that prize must still offer its own current source, or it would
    // be missing from its own dropdown.
    const forEdit = await listAvailableGiveawaySourcesAction(
      event.id,
      prize.id,
    );
    if (!("data" in forEdit)) throw new Error("expected data");
    expect(forEdit.data.inventoryItems.map((i) => i.id)).toContain(
      donation.itemId,
    );

    await deleteGiveawayPrizeAction(prize.id);
    await gift.cleanup();
    await donation.cleanup();
    await event.cleanup();
  });

  // The whole reason allocation lives in a security-definer RPC: this role
  // holds events:manage but none of inventory:*, so it cannot touch
  // inventory_items under its own RLS.
  test("event_coordinator can allocate inventory to a prize despite no inventory permission", async () => {
    const event = await createPublishedEvent();
    const donation = await seedEventDonation(event.id);
    const giveawayId = await seedGiveaway(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    const direct = await currentSupabase
      .from("inventory_items")
      .update({ status: "reserved" })
      .eq("id", donation.itemId)
      .select("id");
    expect(direct.data ?? []).toHaveLength(0);

    expect(
      await createGiveawayPrizeAction(
        giveawayId,
        null,
        prizeForm(),
        donation.itemId,
      ),
    ).toEqual({ success: true });
    expect(await getInventoryItemStatus(donation.itemId)).toBe("reserved");

    const [prize] = await prizesFor(event.id);
    expect(await deleteGiveawayPrizeAction(prize.id)).toEqual({
      success: true,
    });
    expect(await getInventoryItemStatus(donation.itemId)).toBe("available");

    await donation.cleanup();
    await event.cleanup();
  });

  test("view-only roles cannot edit a prize", async () => {
    const event = await createPublishedEvent();
    await seedGiveaway(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.finance);

    expect(
      await updateGiveawayPrizeAction(crypto.randomUUID(), null, prizeForm()),
    ).toEqual(DENIED);

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
