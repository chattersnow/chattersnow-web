// Integration test: exercises the real item-category Server Actions against a
// real local Supabase stack (checkUser/checkPermission, then the real
// `inventory_categories` / `inventory_category_groups` RLS).
//
// The asymmetry between reading and writing the vocabulary is the point of this
// file (issue #667). Editing is gated on `inventory:manage`, but *reading* is
// open to any signed-in user on purpose: the `volunteer` role holds
// `inventory_intake:manage` with `inventory:none`, so gating the list on
// `inventory:view` would show an empty category picker to exactly the people
// who record donations. Nothing else would catch that regression.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  signInAs,
} from "../../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  listInventoryCategoriesAction,
  createInventoryCategoryAction,
  updateInventoryCategoryAction,
  deleteInventoryCategoryAction,
} = await import("./actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const DENIED = { error: "You don't have permission to perform this action." };

function uniqueLabel() {
  return `IT Category ${crypto.randomUUID().slice(0, 8)}`;
}

async function outerwearGroupId() {
  const { data } = await adminClient
    .from("inventory_category_groups")
    .select("id")
    .eq("key", "outerwear")
    .single();
  return (data as { id: string }).id;
}

function categoryForm(groupId: string, label: string) {
  const formData = new FormData();
  formData.set("groupId", groupId);
  formData.set("label", label);
  formData.set("sortOrder", "999");
  return formData;
}

async function deleteByLabel(label: string) {
  await adminClient.from("inventory_categories").delete().eq("label", label);
}

describe("listInventoryCategoriesAction (integration)", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();
    expect(await listInventoryCategoriesAction()).toEqual({
      error: "You must be signed in to load item categories.",
    });
  });

  test("returns the seeded vocabulary with its group, ordered", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const result = await listInventoryCategoriesAction();

    if (!("data" in result)) throw new Error("expected categories");
    const jacket = result.data.find((category) => category.key === "jacket");
    expect(jacket).toMatchObject({
      label: "Jacket",
      groupKey: "outerwear",
      groupLabel: "Outerwear",
    });

    // Ordered by group then category, so a grouped <Select> can render the
    // list as it arrives.
    const groupOrder = result.data.map((category) => category.groupKey);
    expect(groupOrder.indexOf("hardgoods")).toBeLessThan(
      groupOrder.indexOf("outerwear"),
    );
  });

  test("an intake volunteer can read it despite holding inventory:none", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);
    const result = await listInventoryCategoriesAction();

    if (!("data" in result)) throw new Error("expected categories");
    expect(result.data.length).toBeGreaterThan(0);
  });
});

describe("createInventoryCategoryAction (integration)", () => {
  test("a volunteer cannot create a category", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);
    const groupId = await outerwearGroupId();
    expect(
      await createInventoryCategoryAction(categoryForm(groupId, uniqueLabel())),
    ).toEqual(DENIED);
  });

  test("an admin can create one, and its key is slugified from the name", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const groupId = await outerwearGroupId();
    const label = uniqueLabel();

    expect(
      await createInventoryCategoryAction(categoryForm(groupId, label)),
    ).toEqual({ success: true });

    const { data } = await adminClient
      .from("inventory_categories")
      .select("key, group_id, sort_order, is_active")
      .eq("label", label)
      .single();

    expect(data).toMatchObject({
      key: label.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      group_id: groupId,
      sort_order: 999,
      is_active: true,
    });

    await deleteByLabel(label);
  });
});

describe("updateInventoryCategoryAction (integration)", () => {
  test("renaming leaves the key alone", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const groupId = await outerwearGroupId();
    const label = uniqueLabel();
    await createInventoryCategoryAction(categoryForm(groupId, label));

    const { data: created } = await adminClient
      .from("inventory_categories")
      .select("id, key")
      .eq("label", label)
      .single();
    const { id, key } = created as { id: string; key: string };

    const renamed = `${label} renamed`;
    expect(
      await updateInventoryCategoryAction(id, categoryForm(groupId, renamed)),
    ).toEqual({ success: true });

    const { data: after } = await adminClient
      .from("inventory_categories")
      .select("key, label")
      .eq("id", id)
      .single();

    // The key is what filters, URLs and the backfill aliases join on, so a
    // rename must not move it.
    expect(after).toEqual({ key, label: renamed });

    await deleteByLabel(renamed);
  });
});

describe("deleteInventoryCategoryAction (integration)", () => {
  test("an unused category can be deleted", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const groupId = await outerwearGroupId();
    const label = uniqueLabel();
    await createInventoryCategoryAction(categoryForm(groupId, label));

    const { data: created } = await adminClient
      .from("inventory_categories")
      .select("id")
      .eq("label", label)
      .single();

    expect(
      await deleteInventoryCategoryAction((created as { id: string }).id),
    ).toEqual({ success: true });
  });

  test("a category still in use is refused, pointing at deactivation", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    // The seed data files items under "jacket", so the on delete restrict FK
    // has to bite here.
    const { data } = await adminClient
      .from("inventory_categories")
      .select("id")
      .eq("key", "jacket")
      .single();

    const result = await deleteInventoryCategoryAction(
      (data as { id: string }).id,
    );

    expect(result).toEqual({
      error:
        "This category is in use by existing items. Deactivate it instead — it will stay on those items but disappear from the pickers.",
    });
  });
});
