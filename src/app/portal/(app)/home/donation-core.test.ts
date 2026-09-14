// #1082 Phase 1. These tests exist because `createDonation` is no longer
// reachable only through a Server Action: it takes any authenticated client,
// so its guards and its input normalization are now a shared contract rather
// than an implementation detail of one form submit.
//
// What they can prove is what the TypeScript does. What refuses an
// under-privileged caller in production is has_permission() inside
// create_donation_with_items, which is Postgres's to enforce and
// *.integration.test.ts's to cover -- the checks below are the message, not
// the gate.
import { describe, expect, test } from "bun:test";
import { createDonation } from "./donation-core";
import {
  domainRpcCalls,
  fakeSupabase,
} from "../../../../../test/fake-supabase";

const VALID_INPUT = {
  isAnonymous: false,
  donorName: "Ada Lovelace",
  sourceType: "individual",
  items: [
    {
      description: "Blue jacket",
      categoryKey: "jackets",
      condition: "good",
      intendedUse: "gear_library",
    },
  ],
};

const INTAKE_ONLY = { inventory_intake: "manage" as const };

describe("createDonation", () => {
  test("refuses a signed-out caller before touching the database", async () => {
    const supabase = fakeSupabase({ userId: null });

    const result = await createDonation(supabase.client, VALID_INPUT);

    expect(result).toEqual({
      error: "You must be signed in to record a donation.",
    });
    expect(domainRpcCalls(supabase.rpcCalls)).toEqual([]);
  });

  test("refuses a caller holding neither finance nor intake manage", async () => {
    const supabase = fakeSupabase({ permissions: { events: "manage" } });

    const result = await createDonation(supabase.client, VALID_INPUT);

    expect(result).toEqual({
      error: "You don't have permission to perform this action.",
    });
    expect(domainRpcCalls(supabase.rpcCalls)).toEqual([]);
  });

  test("accepts inventory_intake:manage alone", async () => {
    // The Phase 0 spike nearly recorded a false security finding on this:
    // the seeded volunteer holds inventory_intake:manage and nothing else,
    // and its donations are supposed to succeed. Pinning it here so the
    // next person reading the permission pair does not "tighten" it.
    const supabase = fakeSupabase({
      permissions: INTAKE_ONLY,
      rpc: {
        create_donation_with_items: {
          data: [{ donation_id: "d1", giveaway_id: null }],
        },
      },
    });

    const result = await createDonation(supabase.client, VALID_INPUT);

    expect(result).toEqual({ success: true, giveaway: null });
  });

  test("rejects invalid input without calling the RPC", async () => {
    const supabase = fakeSupabase({ permissions: INTAKE_ONLY });

    const result = await createDonation(supabase.client, {
      ...VALID_INPUT,
      isAnonymous: false,
      donorName: "   ",
    });

    expect("error" in result).toBe(true);
    expect(domainRpcCalls(supabase.rpcCalls)).toEqual([]);
  });

  test("hands the RPC the parsed arguments, not the raw input", async () => {
    const supabase = fakeSupabase({
      permissions: INTAKE_ONLY,
      rpc: {
        create_donation_with_items: {
          data: [{ donation_id: "d1", giveaway_id: null }],
        },
      },
    });

    await createDonation(supabase.client, {
      ...VALID_INPUT,
      donorName: "  Ada Lovelace  ",
    });

    const [call] = domainRpcCalls(supabase.rpcCalls);
    expect(call.name).toBe("create_donation_with_items");
    expect(call.args).toMatchObject({
      p_donor_name: "Ada Lovelace",
      p_donor_is_anonymous: false,
      p_donor_source_type: "individual",
    });
  });

  test("turns an RPC failure into display copy", async () => {
    const supabase = fakeSupabase({
      permissions: INTAKE_ONLY,
      rpc: {
        create_donation_with_items: {
          error: { message: "Not authorized to record a donation" },
        },
      },
    });

    const result = await createDonation(supabase.client, VALID_INPUT);

    expect(result).toEqual({
      error: "Could not save the donation. Please try again.",
    });
  });

  test("returns the giveaway grant when the donation earned tickets", async () => {
    const totals = [
      {
        tier_id: "t1",
        tier_key: "gold",
        tier_label: "Gold",
        tier_rank: 1,
        quantity: 2,
      },
    ];
    const supabase = fakeSupabase({
      permissions: INTAKE_ONLY,
      rpc: {
        create_donation_with_items: {
          data: [
            {
              donation_id: "d1",
              giveaway_id: "g1",
              untiered_item_ids: ["i9"],
            },
          ],
        },
        giveaway_ticket_totals: { data: totals },
      },
    });

    const result = await createDonation(supabase.client, VALID_INPUT);

    expect(result).toEqual({
      success: true,
      giveaway: { giveawayId: "g1", totals, untieredItemIds: ["i9"] },
    });
  });

  test("still reports success when the ticket totals cannot be read", async () => {
    // The donation is saved by then. Reporting a failure here would send the
    // staffer to record it a second time.
    const supabase = fakeSupabase({
      permissions: INTAKE_ONLY,
      rpc: {
        create_donation_with_items: {
          data: [{ donation_id: "d1", giveaway_id: "g1" }],
        },
        giveaway_ticket_totals: { error: { message: "boom" } },
      },
    });

    const result = await createDonation(supabase.client, VALID_INPUT);

    expect(result).toEqual({
      success: true,
      giveaway: { giveawayId: "g1", totals: [], untieredItemIds: [] },
    });
  });
});
