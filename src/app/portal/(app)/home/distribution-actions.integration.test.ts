// Integration test: exercises the real recordEventDistributionAction against
// a real local Supabase stack (checkUser/checkAnyPermission,
// record_event_distribution RPC, RLS). Requires
// `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createAvailableGearItems,
  createPerson,
  createPublishedEvent,
  getInventoryItemStatus,
  signIn,
  signInAs,
} from "../../../../../test/integration-setup";
import type { RecordDistributionInput } from "./distribution-form";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { recordEventDistributionAction } =
  await import("./distribution-actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

function distributionInput(
  itemId: string,
  overrides?: Partial<RecordDistributionInput>,
): RecordDistributionInput {
  return {
    inventoryItemId: itemId,
    quantity: 1,
    markDistributed: true,
    ...overrides,
  };
}

async function getMovement(itemId: string) {
  const { data, error } = await adminClient
    .from("inventory_movements")
    .select("movement_type, quantity, event_id, recipient_person_id")
    .eq("inventory_item_id", itemId)
    .eq("movement_type", "distributed")
    .single();
  if (error) throw error;
  return data;
}

describe("recordEventDistributionAction (integration)", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();
    const result = await recordEventDistributionAction(
      distributionInput(crypto.randomUUID()),
    );
    expect(result).toEqual({
      error: "You must be signed in to record a distribution.",
    });
  });

  test("admin role (inventory manage) can record a distribution", async () => {
    const { itemIds, cleanup } = await createAvailableGearItems(1);
    currentSupabase = await signIn(SEEDED_USERS.admin);

    const result = await recordEventDistributionAction(
      distributionInput(itemIds[0]),
    );
    expect(result).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/home");
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/inventory/items");
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/inventory/distribution",
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/events");

    expect(await getInventoryItemStatus(itemIds[0])).toBe("distributed");
    const movement = await getMovement(itemIds[0]);
    expect(movement.movement_type).toBe("distributed");
    expect(movement.quantity).toBe(1);

    await cleanup();
  });

  test("volunteer role (inventory_intake manage) can also record a distribution", async () => {
    const { itemIds, cleanup } = await createAvailableGearItems(1);
    currentSupabase = await signIn(SEEDED_USERS.volunteer);

    const result = await recordEventDistributionAction(
      distributionInput(itemIds[0]),
    );
    expect(result).toEqual({ success: true });
    expect(await getInventoryItemStatus(itemIds[0])).toBe("distributed");

    await cleanup();
  });

  test("multi role (event_coordinator + volunteer) can also record a distribution", async () => {
    const { itemIds, cleanup } = await createAvailableGearItems(1);
    currentSupabase = await signIn(SEEDED_USERS.multi);

    const result = await recordEventDistributionAction(
      distributionInput(itemIds[0]),
    );
    expect(result).toEqual({ success: true });
    expect(await getInventoryItemStatus(itemIds[0])).toBe("distributed");

    await cleanup();
  });

  test("board role cannot record a distribution", async () => {
    const { itemIds, cleanup } = await createAvailableGearItems(1);
    currentSupabase = await signIn(SEEDED_USERS.board);

    const result = await recordEventDistributionAction(
      distributionInput(itemIds[0]),
    );
    expect(result).toEqual({
      error: "You don't have permission to perform this action.",
    });
    expect(await getInventoryItemStatus(itemIds[0])).toBe("available");

    await cleanup();
  });

  test("event_coordinator role cannot record a distribution", async () => {
    const { itemIds, cleanup } = await createAvailableGearItems(1);
    currentSupabase = await signIn(SEEDED_USERS.coordinator);

    const result = await recordEventDistributionAction(
      distributionInput(itemIds[0]),
    );
    expect(result).toEqual({
      error: "You don't have permission to perform this action.",
    });

    await cleanup();
  });

  test("finance role cannot record a distribution", async () => {
    const { itemIds, cleanup } = await createAvailableGearItems(1);
    currentSupabase = await signIn(SEEDED_USERS.finance);

    const result = await recordEventDistributionAction(
      distributionInput(itemIds[0]),
    );
    expect(result).toEqual({
      error: "You don't have permission to perform this action.",
    });

    await cleanup();
  });

  test("a user with no role assignment cannot record a distribution", async () => {
    const { itemIds, cleanup } = await createAvailableGearItems(1);
    currentSupabase = await signIn(SEEDED_USERS.noAccess);

    const result = await recordEventDistributionAction(
      distributionInput(itemIds[0]),
    );
    expect(result).toEqual({
      error: "You don't have permission to perform this action.",
    });

    await cleanup();
  });

  test("a deactivated (former) account cannot record a distribution", async () => {
    const { itemIds, cleanup } = await createAvailableGearItems(1);
    currentSupabase = await signIn(SEEDED_USERS.former);

    const result = await recordEventDistributionAction(
      distributionInput(itemIds[0]),
    );
    expect(result).toEqual({
      error: "You don't have permission to perform this action.",
    });

    await cleanup();
  });

  test("markDistributed: false records a movement but leaves the item available", async () => {
    const { itemIds, cleanup } = await createAvailableGearItems(1);
    currentSupabase = await signIn(SEEDED_USERS.admin);

    const result = await recordEventDistributionAction(
      distributionInput(itemIds[0], { markDistributed: false }),
    );
    expect(result).toEqual({ success: true });
    expect(await getInventoryItemStatus(itemIds[0])).toBe("available");

    const movement = await getMovement(itemIds[0]);
    expect(movement.movement_type).toBe("distributed");

    await cleanup();
  });

  test("records the linked event and recipient on the movement", async () => {
    const { itemIds, cleanup } = await createAvailableGearItems(1);
    const event = await createPublishedEvent();
    const recipient = await createPerson();
    currentSupabase = await signIn(SEEDED_USERS.admin);

    const result = await recordEventDistributionAction(
      distributionInput(itemIds[0], {
        eventId: event.id,
        recipientPersonId: recipient.id,
      }),
    );
    expect(result).toEqual({ success: true });

    const movement = await getMovement(itemIds[0]);
    expect(movement.event_id).toBe(event.id);
    expect(movement.recipient_person_id).toBe(recipient.id);

    await cleanup();
    await recipient.cleanup();
    await event.cleanup();
  });
});

// The action tests above only reach `inventory_movements` through
// record_event_distribution, i.e. the insert path. No Server Action exposes
// selecting, updating or deleting a movement row directly, so these tests hit
// the table with the real signed-in client (same client the app uses) to cover
// the remaining policies from 20260822100000_role_scoped_rls_data_driven.sql:
// select -> inventory:manage OR inventory_reports:view; update/delete ->
// inventory:manage only.
describe("inventory_movements table RLS (integration, no Server Action to exercise)", () => {
  // create_donation_with_items records a 'received' movement per item, so a
  // fresh gear item is enough to get a real movement row to assert against.
  async function createMovement() {
    const { itemIds, cleanup } = await createAvailableGearItems(1);
    const { data, error } = await adminClient
      .from("inventory_movements")
      .select("id")
      .eq("inventory_item_id", itemIds[0])
      .single();
    if (error) throw error;
    return { id: data.id as string, itemId: itemIds[0], cleanup };
  }

  async function readReason(movementId: string) {
    const { data } = await adminClient
      .from("inventory_movements")
      .select("reason")
      .eq("id", movementId)
      .maybeSingle();
    return data?.reason ?? null;
  }

  test("finance role (inventory_reports:view) can select a movement directly", async () => {
    const movement = await createMovement();
    const client = await signInAs(SEEDED_USERS.finance);

    const { data, error } = await client
      .from("inventory_movements")
      .select("id, movement_type")
      .eq("id", movement.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].movement_type).toBe("received");

    await movement.cleanup();
  });

  test("admin role (inventory:manage) can select a movement directly", async () => {
    const movement = await createMovement();
    const client = await signInAs(SEEDED_USERS.admin);

    const { data, error } = await client
      .from("inventory_movements")
      .select("id")
      .eq("id", movement.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);

    await movement.cleanup();
  });

  // A denied select is an empty result rather than an error: RLS filters the
  // rows out instead of rejecting the statement.
  test("board role (neither inventory:manage nor inventory_reports:view) cannot select a movement", async () => {
    const movement = await createMovement();
    const client = await signInAs(SEEDED_USERS.board);

    const { data, error } = await client
      .from("inventory_movements")
      .select("id")
      .eq("id", movement.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);

    await movement.cleanup();
  });

  test("volunteer role (inventory_intake:manage, insert-only) cannot select a movement", async () => {
    const movement = await createMovement();
    const client = await signInAs(SEEDED_USERS.volunteer);

    const { data } = await client
      .from("inventory_movements")
      .select("id")
      .eq("id", movement.id);
    expect(data).toEqual([]);

    await movement.cleanup();
  });

  test("admin role (inventory:manage) can update a movement directly", async () => {
    const movement = await createMovement();
    const client = await signInAs(SEEDED_USERS.admin);

    const { error } = await client
      .from("inventory_movements")
      .update({ reason: "Corrected by admin" })
      .eq("id", movement.id);
    expect(error).toBeNull();
    expect(await readReason(movement.id)).toBe("Corrected by admin");

    await movement.cleanup();
  });

  test("finance role (inventory_reports:view only) cannot update a movement directly", async () => {
    const movement = await createMovement();
    const client = await signInAs(SEEDED_USERS.finance);

    await client
      .from("inventory_movements")
      .update({ reason: "Attempted finance edit" })
      .eq("id", movement.id);

    expect(await readReason(movement.id)).toBe("Donation intake");

    await movement.cleanup();
  });

  test("volunteer role (inventory_intake:manage, insert-only) cannot update a movement directly", async () => {
    const movement = await createMovement();
    const client = await signInAs(SEEDED_USERS.volunteer);

    await client
      .from("inventory_movements")
      .update({ reason: "Attempted volunteer edit" })
      .eq("id", movement.id);

    expect(await readReason(movement.id)).toBe("Donation intake");

    await movement.cleanup();
  });

  test("admin role (inventory:manage) can delete a movement directly", async () => {
    const movement = await createMovement();
    const client = await signInAs(SEEDED_USERS.admin);

    const { error } = await client
      .from("inventory_movements")
      .delete()
      .eq("id", movement.id);
    expect(error).toBeNull();

    const { data } = await adminClient
      .from("inventory_movements")
      .select("id")
      .eq("id", movement.id)
      .maybeSingle();
    expect(data).toBeNull();

    await movement.cleanup();
  });

  test("finance role (inventory_reports:view only) cannot delete a movement directly", async () => {
    const movement = await createMovement();
    const client = await signInAs(SEEDED_USERS.finance);

    await client.from("inventory_movements").delete().eq("id", movement.id);

    const { data } = await adminClient
      .from("inventory_movements")
      .select("id")
      .eq("id", movement.id)
      .maybeSingle();
    expect(data?.id).toBe(movement.id);

    await movement.cleanup();
  });
});
