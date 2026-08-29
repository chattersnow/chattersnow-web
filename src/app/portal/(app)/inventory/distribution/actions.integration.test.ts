// Integration test: exercises the real updateDistributionAction and
// deleteDistributionAction against a real local Supabase stack — the RLS
// update/delete policies on inventory_movements admit inventory:manage only
// (not inventory_intake:manage), so mocked-client unit tests can't prove the
// permission gates here match the table policies. Distributions are seeded
// through the same record_event_distribution RPC the portal uses.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createAvailableGearItems,
  signIn,
} from "../../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { updateDistributionAction, deleteDistributionAction } =
  await import("./actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

async function createDistribution() {
  const gear = await createAvailableGearItems(1);
  const { data: movementId, error } = await adminClient.rpc(
    "record_event_distribution",
    {
      p_inventory_item_id: gear.itemIds[0],
      p_quantity: 1,
      p_reason: "integration seed",
      p_mark_item_distributed: false,
    },
  );
  if (error) throw error;
  return {
    id: movementId as string,
    async cleanup() {
      await gear.cleanup();
    },
  };
}

function editFormData(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set("quantity", "3");
  formData.set("occurredAt", "2026-06-01T12:00");
  formData.set("reason", "Updated by integration test");
  formData.set("recipientPersonId", "");
  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }
  return formData;
}

const DENIED = { error: "You don't have permission to perform this action." };

describe("updateDistributionAction (integration)", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();
    const result = await updateDistributionAction(
      crypto.randomUUID(),
      editFormData(),
    );
    expect(result).toEqual({
      error: "You must be signed in to update a distribution.",
    });
  });

  test("admin role (inventory:manage) can update a distribution", async () => {
    const distribution = await createDistribution();
    currentSupabase = await signIn(SEEDED_USERS.admin);

    const result = await updateDistributionAction(
      distribution.id,
      editFormData(),
    );
    expect(result).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/inventory/distribution",
    );

    const { data: row } = await adminClient
      .from("inventory_movements")
      .select("quantity, reason")
      .eq("id", distribution.id)
      .single();
    expect(row?.quantity).toBe(3);
    expect(row?.reason).toBe("Updated by integration test");

    await distribution.cleanup();
  });

  test("volunteer role (inventory_intake:manage only) cannot update a distribution", async () => {
    const distribution = await createDistribution();
    currentSupabase = await signIn(SEEDED_USERS.volunteer);

    const result = await updateDistributionAction(
      distribution.id,
      editFormData(),
    );
    expect(result).toEqual(DENIED);

    await distribution.cleanup();
  });

  test("board role cannot update a distribution", async () => {
    const distribution = await createDistribution();
    currentSupabase = await signIn(SEEDED_USERS.board);

    const result = await updateDistributionAction(
      distribution.id,
      editFormData(),
    );
    expect(result).toEqual(DENIED);

    await distribution.cleanup();
  });

  test("rejects a non-positive quantity", async () => {
    const distribution = await createDistribution();
    currentSupabase = await signIn(SEEDED_USERS.admin);

    const result = await updateDistributionAction(
      distribution.id,
      editFormData({ quantity: "0" }),
    );
    expect(result).toEqual({
      error: "Quantity must be a whole number greater than zero.",
    });

    await distribution.cleanup();
  });
});

describe("deleteDistributionAction (integration)", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();
    const result = await deleteDistributionAction(crypto.randomUUID());
    expect(result).toEqual({
      error: "You must be signed in to delete a distribution.",
    });
  });

  test("admin role (inventory:manage) can delete a distribution", async () => {
    const distribution = await createDistribution();
    currentSupabase = await signIn(SEEDED_USERS.admin);

    const result = await deleteDistributionAction(distribution.id);
    expect(result).toEqual({ success: true });

    const { data: row } = await adminClient
      .from("inventory_movements")
      .select("id")
      .eq("id", distribution.id)
      .maybeSingle();
    expect(row).toBeNull();

    await distribution.cleanup();
  });

  test("volunteer role (inventory_intake:manage only) cannot delete a distribution", async () => {
    const distribution = await createDistribution();
    currentSupabase = await signIn(SEEDED_USERS.volunteer);

    const result = await deleteDistributionAction(distribution.id);
    expect(result).toEqual(DENIED);

    const { data: row } = await adminClient
      .from("inventory_movements")
      .select("id")
      .eq("id", distribution.id)
      .maybeSingle();
    expect(row?.id).toBe(distribution.id);

    await distribution.cleanup();
  });
});
