// Integration test (#1542): the Items list's bulk assign, which walks the
// selection calling assignNumberedCodeAction once per item, against a real
// local Supabase stack -- a mixed batch where one item takes its code, one
// code is already on another item and one item has left inventory, typed the
// three ways a person types a code. Requires
// `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  createAvailableGearItems,
  serviceRoleClient,
} from "../../../../../../test/integration-setup";

mock.module("next/cache", () => ({ revalidatePath: mock(() => {}) }));

let currentSupabase: SupabaseClient = adminClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { assignNumberedCodeAction, freeNumberedCodesAction } =
  await import("./codes/actions");

type NewCode = { id: string; number: number; value: string };
const createdTagIds: string[] = [];
let itemIds: string[];
let codes: NewCode[];
let cleanup: () => Promise<void>;

async function numberedCodeOf(itemId: string) {
  const { data } = await adminClient
    .from("inventory_item_tags")
    .select("value")
    .eq("kind", "numbered")
    .eq("item_id", itemId)
    .maybeSingle();
  return data?.value ?? null;
}

beforeAll(async () => {
  currentSupabase = adminClient;
  const fixture = await createAvailableGearItems(4);
  itemIds = fixture.itemIds;
  cleanup = fixture.cleanup;
  const { data, error } = await adminClient.rpc(
    "generate_numbered_inventory_tags",
    { p_count: 3 },
  );
  if (error) throw error;
  codes = data as NewCode[];
  createdTagIds.push(...codes.map((code) => code.id));
});

afterAll(async () => {
  await cleanup?.();
  if (createdTagIds.length) {
    await serviceRoleClient()
      .from("inventory_item_tags")
      .delete()
      .in("id", createdTagIds);
  }
});

describe("bulk assign numbered codes (integration)", () => {
  test("a mixed batch: assigned, code taken, item gone", async () => {
    const [assigned, taken, held, gone] = itemIds;
    const [codeA, codeB, codeC] = codes;

    // codeB is already on another item before the batch starts.
    expect(await assignNumberedCodeAction(held, codeB.value)).toEqual({
      outcome: "assigned",
      code: codeB.value,
    });
    // One selected item leaves inventory after the list was loaded.
    const { error } = await adminClient
      .from("inventory_items")
      .update({ status: "retired" })
      .eq("id", gone);
    expect(error).toBeNull();

    // The batch, one item at a time, typed as a bare number, a padded
    // number and the full code.
    const results = [
      await assignNumberedCodeAction(assigned, String(codeA.number)),
      await assignNumberedCodeAction(
        taken,
        String(codeB.number).padStart(3, "0"),
      ),
      await assignNumberedCodeAction(gone, codeC.value),
    ];

    expect(results[0]).toEqual({ outcome: "assigned", code: codeA.value });
    expect(results[1]).toMatchObject({
      outcome: "held",
      code: codeB.value,
      holder: { id: held },
    });
    expect(results[2]).toMatchObject({ reason: "item_gone" });

    // Only the first changed anything: the taken code stayed where it was,
    // and the gone item took nothing.
    expect(await numberedCodeOf(assigned)).toBe(codeA.value);
    expect(await numberedCodeOf(taken)).toBeNull();
    expect(await numberedCodeOf(held)).toBe(codeB.value);
    expect(await numberedCodeOf(gone)).toBeNull();

    // The Items list's "No numbered code" filter drops the assigned item.
    const { data: withoutNumbered } = await adminClient
      .from("inventory_items_with_category")
      .select("id")
      .in("id", itemIds)
      .not("tag_kinds", "cs", "{numbered}");
    const ids = (withoutNumbered ?? []).map((row) => row.id);
    expect(ids).not.toContain(assigned);
    expect(ids).toContain(taken);

    // Neither bound code is suggested again.
    const free = await freeNumberedCodesAction(500);
    expect("codes" in free).toBe(true);
    if ("codes" in free) {
      expect(free.codes).not.toContain(codeA.value);
      expect(free.codes).not.toContain(codeB.value);
    }
  });

  test("an unknown code is refused with its reason, and binds nothing", async () => {
    const result = await assignNumberedCodeAction(itemIds[1], "999999");
    expect(result).toMatchObject({ reason: "unknown" });
    expect(await numberedCodeOf(itemIds[1])).toBeNull();
  });
});
