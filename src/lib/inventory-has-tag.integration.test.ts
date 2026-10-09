// Integration test: the `has_tag` computed field on inventory_items_with_category,
// which the items list's Tag filter reads. Requires `bun run db:start && bun run
// db:reset` first; run via `bun run test:integration`. Not picked up by
// `bun run test`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  adminClient,
  createAvailableGearItems,
  removeAssetTags,
} from "../../test/integration-setup";

let tagged: string;
let untagged: string;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const fixture = await createAvailableGearItems(2);
  [tagged, untagged] = fixture.itemIds;
  cleanup = fixture.cleanup;
  // Intake coded both; take one back off so it stands for an item with none.
  await removeAssetTags([untagged]);
});

afterAll(async () => {
  await cleanup();
});

async function idsWhereHasTag(value: boolean) {
  const { data, error } = await adminClient
    .from("inventory_items_with_category")
    .select("id")
    .in("id", [tagged, untagged])
    .is("has_tag", value);
  if (error) throw error;
  return (data ?? []).map((row) => row.id);
}

describe("has_tag", () => {
  test("is false only for the item with no tag", async () => {
    expect(await idsWhereHasTag(false)).toEqual([untagged]);
    expect(await idsWhereHasTag(true)).toEqual([tagged]);
  });

  test("a barcode alone counts as a tag", async () => {
    const { error } = await adminClient
      .from("inventory_item_tags")
      .insert({ item_id: untagged, kind: "barcode", value: "012345678905" });
    if (error) throw error;
    try {
      expect(await idsWhereHasTag(false)).toEqual([]);
    } finally {
      await adminClient
        .from("inventory_item_tags")
        .delete()
        .eq("item_id", untagged);
    }
  });
});
