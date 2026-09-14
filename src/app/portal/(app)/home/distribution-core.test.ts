// #1082 Phase 1. See donation-core.test.ts for what these can and cannot
// prove; the real gate is has_permission() inside record_event_distribution.
import { describe, expect, test } from "bun:test";
import { recordEventDistribution } from "./distribution-core";
import {
  domainRpcCalls,
  fakeSupabase,
} from "../../../../../test/fake-supabase";

const VALID_INPUT = {
  inventoryItemId: "item-1",
  quantity: 1,
  markDistributed: true,
};

const INTAKE_ONLY = { inventory_intake: "manage" as const };

describe("recordEventDistribution", () => {
  test("refuses a signed-out caller before touching the database", async () => {
    const supabase = fakeSupabase({ userId: null });

    const result = await recordEventDistribution(supabase.client, VALID_INPUT);

    expect(result).toEqual({
      error: "You must be signed in to record a distribution.",
    });
    expect(domainRpcCalls(supabase.rpcCalls)).toEqual([]);
  });

  test("refuses a caller holding neither inventory nor intake manage", async () => {
    const supabase = fakeSupabase({ permissions: { events: "manage" } });

    const result = await recordEventDistribution(supabase.client, VALID_INPUT);

    expect(result).toEqual({
      error: "You don't have permission to perform this action.",
    });
    expect(domainRpcCalls(supabase.rpcCalls)).toEqual([]);
  });

  test("rejects invalid input without calling the RPC", async () => {
    const supabase = fakeSupabase({ permissions: INTAKE_ONLY });

    const result = await recordEventDistribution(supabase.client, {
      ...VALID_INPUT,
      inventoryItemId: "  ",
    });

    expect(result).toEqual({ error: "Select an inventory item." });
    expect(domainRpcCalls(supabase.rpcCalls)).toEqual([]);
  });

  test("hands the RPC the parsed arguments", async () => {
    const supabase = fakeSupabase({ permissions: INTAKE_ONLY });

    const result = await recordEventDistribution(supabase.client, VALID_INPUT);

    expect(result).toEqual({ success: true });
    const [call] = domainRpcCalls(supabase.rpcCalls);
    expect(call.name).toBe("record_event_distribution");
    expect(call.args).toMatchObject({
      p_inventory_item_id: "item-1",
      p_quantity: 1,
      p_mark_item_distributed: true,
    });
  });

  test("names the lost race rather than saying 'try again'", async () => {
    // record_event_distribution raises this when another staffer gave the item
    // out between the picker rendering and this submit landing (#748). Trying
    // again is the one thing that cannot help, so the copy must not suggest
    // it -- and this mapping is now shared by every consumer of the core.
    const supabase = fakeSupabase({
      permissions: INTAKE_ONLY,
      rpc: {
        record_event_distribution: {
          error: { message: "ITEM_ALREADY_DISTRIBUTED" },
        },
      },
    });

    const result = await recordEventDistribution(supabase.client, VALID_INPUT);

    expect(result).toEqual({
      error:
        "That item has already been distributed. Refresh and pick another.",
    });
  });

  test("turns any other RPC failure into generic display copy", async () => {
    const supabase = fakeSupabase({
      permissions: INTAKE_ONLY,
      rpc: {
        record_event_distribution: { error: { message: "connection reset" } },
      },
    });

    const result = await recordEventDistribution(supabase.client, VALID_INPUT);

    expect(result).toEqual({
      error: "Could not record the distribution. Please try again.",
    });
  });
});
