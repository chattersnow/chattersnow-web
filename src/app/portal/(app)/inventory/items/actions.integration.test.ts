// Integration test: exercises the real updateInventoryItemAction against a
// real local Supabase stack (checkAnyPermission, then real `inventory_items`
// RLS). No integration test previously touched `inventory_items`'
// role-based access, only the public gear-cart flow (anon reads of already-
// available items). Requires `bun run db:start && bun run db:reset` first;
// run via `bun run test:integration`. Not picked up by `bun run test`.
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

const { updateInventoryItemAction } = await import("./actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

function itemForm(overrides?: { description?: string }) {
  const fd = new FormData();
  fd.set("description", overrides?.description ?? "Updated description");
  fd.set("type", "snowboard");
  fd.set("condition", "good");
  fd.set("status", "available");
  return fd;
}

const DENIED = { error: "You don't have permission to perform this action." };

describe("updateInventoryItemAction (integration)", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();
    const result = await updateInventoryItemAction(
      crypto.randomUUID(),
      itemForm(),
    );
    expect(result).toEqual({
      error: "You must be signed in to update an item.",
    });
  });

  test("admin role (inventory manage) can update an item", async () => {
    const { itemIds, cleanup } = await createAvailableGearItems(1);
    currentSupabase = await signIn(SEEDED_USERS.admin);
    const result = await updateInventoryItemAction(
      itemIds[0],
      itemForm({ description: "Admin updated" }),
    );
    expect(result).toEqual({ success: true });

    const { data } = await adminClient
      .from("inventory_items")
      .select("description")
      .eq("id", itemIds[0])
      .single();
    expect(data?.description).toBe("Admin updated");
    await cleanup();
  });

  test("volunteer role (inventory_intake manage carve-out) can update an item", async () => {
    const { itemIds, cleanup } = await createAvailableGearItems(1);
    currentSupabase = await signIn(SEEDED_USERS.volunteer);
    const result = await updateInventoryItemAction(
      itemIds[0],
      itemForm({ description: "Volunteer updated" }),
    );
    expect(result).toEqual({ success: true });
    await cleanup();
  });

  test("finance role (no inventory or inventory_intake access) cannot update an item", async () => {
    const { itemIds, cleanup } = await createAvailableGearItems(1);
    currentSupabase = await signIn(SEEDED_USERS.finance);
    const result = await updateInventoryItemAction(itemIds[0], itemForm());
    expect(result).toEqual(DENIED);
    await cleanup();
  });

  test("board role (no inventory access) cannot update an item", async () => {
    const { itemIds, cleanup } = await createAvailableGearItems(1);
    currentSupabase = await signIn(SEEDED_USERS.board);
    const result = await updateInventoryItemAction(itemIds[0], itemForm());
    expect(result).toEqual(DENIED);
    await cleanup();
  });

  test("a deactivated (former) account cannot update an item", async () => {
    const { itemIds, cleanup } = await createAvailableGearItems(1);
    currentSupabase = await signIn(SEEDED_USERS.former);
    const result = await updateInventoryItemAction(itemIds[0], itemForm());
    expect(result).toEqual(DENIED);
    await cleanup();
  });
});
