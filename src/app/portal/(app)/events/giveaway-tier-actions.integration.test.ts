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

// #748. The pool is what the odds are computed from, so a sale that grants
// its tickets twice, or loses them, changes every entrant's chances. The
// serial test above records one sale at a time and can only prove the matrix
// expands correctly; it says nothing about six tellers at a table on event
// night, which is how tickets are actually sold.
//
// A package has no stock count today (giveaway_ticket_packages, 20260904100000
// -- price, tier, bundle, is_active and nothing else), so "sold out" is not a
// state two sales can race into. If a cap is ever added, this is the block
// that has to grow a case for it.
describe("giveaway ticket sales under concurrency", () => {
  const CONCURRENT_SALES = 6;

  async function saleRows(packageId: string) {
    const { data, error } = await adminClient
      .from("giveaway_ticket_sales")
      .select("id")
      .eq("package_id", packageId);
    if (error) throw error;
    return data;
  }

  async function grantRows(saleIds: string[]) {
    const { data, error } = await adminClient
      .from("giveaway_ticket_grants")
      .select("sale_id, ticket_tier_id")
      .in("sale_id", saleIds);
    if (error) throw error;
    return data;
  }

  test("grants every simultaneous sale its tickets exactly once", async () => {
    currentSupabase = await signIn(SEEDED_USERS.admin);
    // seed_giveaway_tiers is idempotent, so calling it here rather than
    // leaning on the setup test above keeps this case runnable on its own.
    expect(await seedGiveawayTiersAction(giveawayId)).toEqual({
      success: true,
    });
    const bronze = await tierIdFor("bronze");

    expect(
      await upsertGiveawayPackageAction(giveawayId, {
        name: "Bronze concurrency package",
        price: 5,
        tierId: bronze,
        bundleQuantity: 1,
        rank: 9,
        isActive: true,
      }),
    ).toEqual({ success: true });

    const config = await getGiveawayTierConfigAction(giveawayId);
    if (!("data" in config)) throw new Error("expected config");
    const packageId = config.data.packages.find(
      (pkg) => pkg.name === "Bronze concurrency package",
    )!.id;
    const poolBefore = config.data.totals;

    const results = await Promise.all(
      Array.from({ length: CONCURRENT_SALES }, () =>
        recordGiveawayTicketSaleAction(giveawayId, { packageId, quantity: 1 }),
      ),
    );
    for (const result of results) {
      expect(result).toMatchObject({ success: true });
    }

    // One sale row per call: no lost write, and no retry duplicating one.
    const sales = await saleRows(packageId);
    expect(sales).toHaveLength(CONCURRENT_SALES);

    // The bronze row of the seeded matrix is 0 gold / 1 silver / 3 bronze, so
    // only the two non-zero cells become grant rows -- for every sale, once.
    const grants = await grantRows(sales.map((sale) => sale.id as string));
    expect(grants).toHaveLength(CONCURRENT_SALES * 2);
    for (const sale of sales) {
      const forSale = grants.filter((grant) => grant.sale_id === sale.id);
      expect(forSale).toHaveLength(2);
      expect(new Set(forSale.map((grant) => grant.ticket_tier_id)).size).toBe(
        2,
      );
    }

    // And the pool -- the odds denominator -- moved by exactly that much.
    const after = await getGiveawayTierConfigAction(giveawayId);
    if (!("data" in after)) throw new Error("expected config");
    expect(totalFor(after.data.totals, "gold")).toBe(
      totalFor(poolBefore, "gold"),
    );
    expect(totalFor(after.data.totals, "silver")).toBe(
      totalFor(poolBefore, "silver") + CONCURRENT_SALES,
    );
    expect(totalFor(after.data.totals, "bronze")).toBe(
      totalFor(poolBefore, "bronze") + CONCURRENT_SALES * 3,
    );

    await adminClient
      .from("giveaway_ticket_sales")
      .delete()
      .eq("package_id", packageId);
    await adminClient
      .from("giveaway_ticket_packages")
      .delete()
      .eq("id", packageId);
  });
});
