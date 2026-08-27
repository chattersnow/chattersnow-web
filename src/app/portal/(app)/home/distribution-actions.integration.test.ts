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
