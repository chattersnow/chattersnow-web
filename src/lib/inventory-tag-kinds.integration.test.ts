// Integration test: the `tag_kinds` computed field on
// inventory_items_with_category, which the items list's Tag filter reads.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  adminClient,
  createAvailableGearItems,
  removeAssetTags,
  serviceRoleClient,
} from "../../test/integration-setup";

// Intake gives every item an asset-tag code; one also gets a numbered code,
// and one has its code taken back off.
let assetOnly: string;
let numbered: string;
let untagged: string;
let cleanup: () => Promise<void>;
let numberedTagId: string;

beforeAll(async () => {
  const fixture = await createAvailableGearItems(3);
  [assetOnly, numbered, untagged] = fixture.itemIds;
  cleanup = fixture.cleanup;
  await removeAssetTags([untagged]);

  const { data, error } = await adminClient.rpc(
    "generate_numbered_inventory_tags",
    { p_count: 1 },
  );
  if (error) throw error;
  const [code] = data as { id: string; value: string }[];
  numberedTagId = code.id;
  const assigned = await adminClient.rpc("assign_numbered_inventory_tag", {
    p_item_id: numbered,
    p_code: code.value,
  });
  if (assigned.error) throw assigned.error;
});

afterAll(async () => {
  await cleanup?.();
  // A numbered code can only be deleted through the service role.
  await serviceRoleClient()
    .from("inventory_item_tags")
    .delete()
    .eq("id", numberedTagId);
});

function items() {
  return adminClient
    .from("inventory_items_with_category")
    .select("id")
    .in("id", [assetOnly, numbered, untagged])
    .order("id");
}

async function ids(query: ReturnType<typeof items>) {
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => row.id);
}

const sorted = (...values: string[]) => values.sort();

describe("tag_kinds", () => {
  test("lists the kinds on each item, empty for none", async () => {
    const { data, error } = await adminClient
      .from("inventory_items_with_category")
      .select("id, tag_kinds")
      .in("id", [assetOnly, numbered, untagged]);
    if (error) throw error;
    const kinds = new Map(data.map((row) => [row.id, row.tag_kinds]));
    expect(kinds.get(assetOnly)).toEqual(["asset_tag"]);
    expect(kinds.get(numbered)).toEqual(["asset_tag", "numbered"]);
    expect(kinds.get(untagged)).toEqual([]);
  });

  test("answers each of the list's filters", async () => {
    expect(await ids(items().not("tag_kinds", "cs", "{numbered}"))).toEqual(
      sorted(assetOnly, untagged),
    );
    expect(
      await ids(
        items()
          .contains("tag_kinds", ["asset_tag"])
          .not("tag_kinds", "cs", "{numbered}"),
      ),
    ).toEqual([assetOnly]);
    expect(await ids(items().contains("tag_kinds", ["numbered"]))).toEqual([
      numbered,
    ]);
    expect(await ids(items().filter("tag_kinds", "eq", "{}"))).toEqual([
      untagged,
    ]);
    expect(await ids(items().filter("tag_kinds", "neq", "{}"))).toEqual(
      sorted(assetOnly, numbered),
    );
  });
});
