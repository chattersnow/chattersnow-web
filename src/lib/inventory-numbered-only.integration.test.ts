// Integration test (#1541, #1543): a tenant on numbered codes only. Intake
// saves an item with nothing scanned untagged, binds a free numbered code as
// before, and refuses a random code; nothing else may make a new random code;
// and only inventory:manage may change the setting, which needs a prefix.
// Against a real local Supabase stack; run via `bun run test:integration`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  cleanupDonation,
  serviceRoleClient,
  SEEDED_USERS,
  signIn,
} from "../../test/integration-setup";

const volunteer = await signIn(SEEDED_USERS.volunteer);
const board = await signIn(SEEDED_USERS.board);

const donations: string[] = [];
const tagIds: string[] = [];

async function setNumberedOnly(on: boolean, as: SupabaseClient = adminClient) {
  return as.rpc("set_inventory_numbered_codes_only", { p_on: on });
}

async function receive(items: { asset_tag?: string }[]) {
  const result = await volunteer.rpc("create_donation_with_items", {
    p_donor_name: "Numbered Only Donor",
    p_donor_is_anonymous: false,
    p_donor_source_type: "individual",
    p_donor_email: "",
    p_donor_phone: "",
    p_donor_notes: "",
    p_items: items.map((item) => ({
      description: "Numbered-only jacket",
      category_key: "",
      type: "Jacket",
      condition: "good",
      intended_use: "gear_library",
      asset_tag: item.asset_tag ?? null,
    })),
  });
  const row = result.data?.[0];
  if (row) donations.push(row.donation_id);
  return { row, error: result.error };
}

async function tagsOn(itemIds: string[]) {
  const { data } = await adminClient
    .from("inventory_item_tags")
    .select("item_id, kind, value")
    .in("item_id", itemIds);
  return (data ?? []) as { item_id: string; kind: string; value: string }[];
}

// Made while random codes are still on, to scan once they are off.
let blank: string;

beforeAll(async () => {
  const { data, error } = await volunteer.rpc("create_blank_asset_tags", {
    p_count: 1,
  });
  expect(error).toBeNull();
  const [row] = data as { id: string; value: string }[];
  tagIds.push(row.id);
  blank = row.value;
});

afterAll(async () => {
  await setNumberedOnly(false);
  for (const id of donations) await cleanupDonation(id);
  if (tagIds.length) {
    await serviceRoleClient()
      .from("inventory_item_tags")
      .delete()
      .in("id", tagIds);
  }
});

describe("numbered codes only (integration)", () => {
  test("off, the default: an item with nothing scanned gets a random code", async () => {
    const { row, error } = await receive([{}]);
    expect(error).toBeNull();
    expect(row!.asset_tags).toHaveLength(1);
    expect(row!.asset_tags[0]).toBeTruthy();
    const tags = await tagsOn(row!.inventory_item_ids);
    expect(tags.map((tag) => tag.kind)).toEqual(["asset_tag"]);
  });

  test("only inventory:manage may change the setting", async () => {
    const { error } = await setNumberedOnly(true, board);
    expect(error).not.toBeNull();
    const { data, error: adminError } = await setNumberedOnly(true);
    expect(adminError).toBeNull();
    expect(data).toBe(true);
  });

  test("on: an item with nothing scanned is saved untagged, and listed under No numbered code", async () => {
    const { row, error } = await receive([{}, {}]);
    expect(error).toBeNull();
    expect(row!.inventory_item_ids).toHaveLength(2);
    expect(row!.asset_tags).toEqual([null, null]);
    expect(await tagsOn(row!.inventory_item_ids)).toEqual([]);

    const { data: listed } = await adminClient
      .from("inventory_items_with_category")
      .select("id")
      .in("id", row!.inventory_item_ids)
      .not("tag_kinds", "cs", "{numbered}");
    expect((listed ?? []).map((item) => item.id).sort()).toEqual(
      [...row!.inventory_item_ids].sort(),
    );
  });

  test("on: a free numbered code scanned at intake is bound, beside an untagged item", async () => {
    const { data, error: generateError } = await adminClient.rpc(
      "generate_numbered_inventory_tags",
      { p_count: 1 },
    );
    expect(generateError).toBeNull();
    const [code] = data as { id: string; value: string }[];
    tagIds.push(code.id);

    const { row, error } = await receive([{ asset_tag: code.value }, {}]);
    expect(error).toBeNull();
    expect(row!.asset_tags).toEqual([code.value, null]);
    const tags = await tagsOn(row!.inventory_item_ids);
    expect(tags).toEqual([
      {
        item_id: row!.inventory_item_ids[0],
        kind: "numbered",
        value: code.value,
      },
    ]);
  });

  test("on: a random code is refused at the scan and at save", async () => {
    const { data: scan } = await volunteer.rpc("inventory_intake_scan", {
      p_asset_tag: blank,
      p_barcode: "",
    });
    expect(scan?.[0]?.asset_tag_status).toBe("not_numbered");

    const { row, error } = await receive([{ asset_tag: blank }]);
    expect(row).toBeUndefined();
    expect(error?.hint).toBe("asset_tag_not_numbered");
  });

  test("on: no new random code can be made, by blank labels or Generate code", async () => {
    const { error: blankError } = await volunteer.rpc(
      "create_blank_asset_tags",
      { p_count: 1 },
    );
    expect(blankError?.message).toBe("INVENTORY_RANDOM_CODES_OFF");

    const { row } = await receive([{}]);
    const { error } = await adminClient.from("inventory_item_tags").insert({
      item_id: row!.inventory_item_ids[0],
      kind: "asset_tag",
      value: "",
    });
    expect(error?.message).toBe("INVENTORY_RANDOM_CODES_OFF");
  });

  test("turned off again, intake gives random codes as before", async () => {
    expect((await setNumberedOnly(false)).error).toBeNull();
    const { row, error } = await receive([{ asset_tag: blank }]);
    expect(error).toBeNull();
    expect(row!.asset_tags).toEqual([blank]);
  });
});
