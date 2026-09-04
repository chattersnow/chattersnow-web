// Integration test: exercises the giveaway tier system (issue #5) against a
// real local Supabase stack -- the seeded grant matrix, both ticket entry
// paths, and the shared pool they feed. Requires `bun run db:start && bun run
// db:reset` first; run via `bun run test:integration`. Not picked up by
// `bun run test`.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  cleanupDonation,
  createPublishedEvent,
  signIn,
} from "../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  getGiveawayTierConfigAction,
  seedGiveawayTiersAction,
  upsertGiveawayPackageAction,
  recordGiveawayTicketSaleAction,
} = await import("./giveaway-tier-actions");
const { createDonationAction } = await import("../home/actions");

let eventId: string;
let giveawayId: string;
const donationIds: string[] = [];

/** Every donation this file creates, so afterAll can unwind them all. */
async function trackDonations() {
  const { data } = await adminClient
    .from("donations")
    .select("id")
    .eq("event_id", eventId);
  for (const row of data ?? []) {
    const id = row.id as string;
    if (!donationIds.includes(id)) donationIds.push(id);
  }
}

beforeAll(async () => {
  currentSupabase = await signIn(SEEDED_USERS.admin);
  const event = await createPublishedEvent();
  eventId = event.id;

  const { data } = await adminClient
    .from("giveaways")
    .insert({ event_id: eventId, name: "Tier system test" })
    .select("id")
    .single();
  giveawayId = data!.id;
});

afterAll(async () => {
  // Order matters: the event delete trigger refuses while linked records
  // remain, and inventory_items are pinned by their 'received' movements --
  // cleanupDonation unwinds both.
  await adminClient.from("giveaways").delete().eq("id", giveawayId);
  for (const donationId of donationIds) {
    await cleanupDonation(donationId);
  }
  await adminClient.from("events").delete().eq("id", eventId);
});

async function tierIdFor(key: string) {
  const { data } = await adminClient
    .from("giveaway_tiers")
    .select("id")
    .eq("giveaway_id", giveawayId)
    .eq("key", key)
    .single();
  return data!.id as string;
}

function totalFor(
  totals: { tier_key: string; quantity: number }[],
  key: string,
) {
  return totals.find((total) => total.tier_key === key)?.quantity ?? 0;
}

describe("giveaway tier setup (integration)", () => {
  test("seeds gold/silver/bronze and the full grant matrix", async () => {
    currentSupabase = await signIn(SEEDED_USERS.admin);
    const result = await seedGiveawayTiersAction(giveawayId);
    expect(result).toEqual({ success: true });

    const config = await getGiveawayTierConfigAction(giveawayId);
    expect("data" in config).toBe(true);
    if (!("data" in config)) return;

    expect(config.data.tiers.map((tier) => tier.key)).toEqual([
      "gold",
      "silver",
      "bronze",
    ]);
    // 3 tiers x 3 ticket colours -- every cell exists, including the zeroes.
    expect(config.data.grants).toHaveLength(9);

    const gold = await tierIdFor("gold");
    const bronze = await tierIdFor("bronze");
    const goldRow = config.data.grants.filter(
      (grant) => grant.source_tier_id === gold,
    );
    expect(
      goldRow.find((grant) => grant.ticket_tier_id === gold)?.quantity,
    ).toBe(3);
    const bronzeRow = config.data.grants.filter(
      (grant) => grant.source_tier_id === bronze,
    );
    expect(
      bronzeRow.find((grant) => grant.ticket_tier_id === gold)?.quantity,
    ).toBe(0);
  });

  test("is idempotent, so a retry can't double the tiers", async () => {
    currentSupabase = await signIn(SEEDED_USERS.admin);
    await seedGiveawayTiersAction(giveawayId);

    const config = await getGiveawayTierConfigAction(giveawayId);
    if (!("data" in config)) throw new Error("expected config");
    expect(config.data.tiers).toHaveLength(3);
    expect(config.data.grants).toHaveLength(9);
  });
});

describe("donated-gear ticket path (integration)", () => {
  test("a snowboard and two beanies earn 3 gold, 3 silver, 7 bronze", async () => {
    currentSupabase = await signIn(SEEDED_USERS.admin);

    const result = await createDonationAction({
      isAnonymous: false,
      donorName: "Tier Path Donor",
      sourceType: "individual",
      eventId,
      items: [
        {
          description: "Burton board",
          categoryKey: "snowboard",
          condition: "good",
        },
        {
          description: "Wool beanie",
          categoryKey: "beanie",
          condition: "good",
        },
        {
          description: "Wool beanie",
          categoryKey: "beanie",
          condition: "good",
        },
      ],
    });

    expect("success" in result).toBe(true);
    if (!("success" in result)) return;
    expect(result.giveaway).not.toBeNull();
    const totals = result.giveaway!.totals;

    expect(totalFor(totals, "gold")).toBe(3);
    expect(totalFor(totals, "silver")).toBe(3);
    expect(totalFor(totals, "bronze")).toBe(7);
    expect(result.giveaway!.untieredItemIds).toHaveLength(0);
    await trackDonations();
  });

  // Also the regression guard for issue #667: tier keywords are now matched
  // against "<group label> <category label> <detail>" rather than the raw free
  // text, so "Poles" must still match nothing -- the group is named
  // "Hardgoods" precisely so that 'ski' does not match a pair of poles.
  test("an item matching no keyword earns nothing and is reported back", async () => {
    currentSupabase = await signIn(SEEDED_USERS.admin);

    const result = await createDonationAction({
      isAnonymous: true,
      donorName: "",
      sourceType: "individual",
      eventId,
      items: [
        { description: "Ski poles", categoryKey: "poles", condition: "good" },
      ],
    });

    if (!("success" in result)) throw new Error("expected success");
    expect(result.giveaway!.untieredItemIds).toHaveLength(1);
    await trackDonations();
  });

  test("an explicit tier overrides the keyword match", async () => {
    currentSupabase = await signIn(SEEDED_USERS.admin);

    const before = await getGiveawayTierConfigAction(giveawayId);
    if (!("data" in before)) throw new Error("expected config");
    const goldBefore = totalFor(before.data.totals, "gold");

    const result = await createDonationAction({
      isAnonymous: true,
      donorName: "",
      sourceType: "individual",
      eventId,
      // "Poles" matches no keyword, so only the explicit tier can grant here.
      items: [
        {
          description: "Ski poles",
          categoryKey: "poles",
          condition: "good",
          giveawayTier: "gold",
        },
      ],
    });

    if (!("success" in result)) throw new Error("expected success");
    expect(totalFor(result.giveaway!.totals, "gold")).toBe(3);
    expect(result.giveaway!.untieredItemIds).toHaveLength(0);

    const after = await getGiveawayTierConfigAction(giveawayId);
    if (!("data" in after)) throw new Error("expected config");
    expect(totalFor(after.data.totals, "gold")).toBe(goldBefore + 3);
    await trackDonations();
  });
});

describe("sold-ticket path (integration)", () => {
  test("a silver package sold twice earns 2 gold, 6 silver, 4 bronze", async () => {
    currentSupabase = await signIn(SEEDED_USERS.admin);
    const silver = await tierIdFor("silver");

    const created = await upsertGiveawayPackageAction(giveawayId, {
      name: "Silver entry",
      price: 20,
      tierId: silver,
      bundleQuantity: 1,
      rank: 0,
      isActive: true,
    });
    expect(created).toEqual({ success: true });

    const config = await getGiveawayTierConfigAction(giveawayId);
    if (!("data" in config)) throw new Error("expected config");
    const packageId = config.data.packages[0].id;
    const poolBefore = config.data.totals;

    const sale = await recordGiveawayTicketSaleAction(giveawayId, {
      packageId,
      quantity: 2,
    });
    expect("success" in sale).toBe(true);
    if (!("success" in sale)) return;

    // The silver row of the matrix is 1/3/2, doubled by the quantity.
    expect(totalFor(sale.totals, "gold")).toBe(2);
    expect(totalFor(sale.totals, "silver")).toBe(6);
    expect(totalFor(sale.totals, "bronze")).toBe(4);

    // Sold and donated tickets share one pool, which is what keeps odds correct.
    const after = await getGiveawayTierConfigAction(giveawayId);
    if (!("data" in after)) throw new Error("expected config");
    expect(totalFor(after.data.totals, "silver")).toBe(
      totalFor(poolBefore, "silver") + 6,
    );
  });

  test("a volunteer without events:manage cannot record a sale", async () => {
    currentSupabase = await signIn(SEEDED_USERS.volunteer);
    const config = await getGiveawayTierConfigAction(giveawayId);
    if (!("data" in config)) throw new Error("expected config");

    const result = await recordGiveawayTicketSaleAction(giveawayId, {
      packageId: config.data.packages[0].id,
      quantity: 1,
    });
    expect("error" in result).toBe(true);
  });

  test("the internal grant helper is not callable directly", async () => {
    // grant_giveaway_tickets is security definer with no permission check of
    // its own, so execute must not be granted to authenticated -- otherwise a
    // signed-in user could mint themselves tickets through PostgREST.
    const client = await signIn(SEEDED_USERS.volunteer);
    const gold = await tierIdFor("gold");
    const { error } = await client.rpc("grant_giveaway_tickets", {
      p_giveaway_id: giveawayId,
      p_source_tier_id: gold,
      p_multiplier: 1,
      p_donation_id: null,
      p_inventory_item_id: null,
      p_sale_id: null,
    });
    expect(error).not.toBeNull();
  });
});
