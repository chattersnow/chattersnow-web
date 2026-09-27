// Integration test (#1444): reusable numbered tag codes against a real local
// Supabase stack -- generation under concurrency, assigning and moving,
// auto-release on every road out of inventory, the assignment history, RLS,
// and the /portal/t/[code] resolver for a numbered code. Requires
// `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  createAvailableGearItems,
  serviceRoleClient,
  signInAs,
  SEEDED_USERS,
  unprivilegedActors,
} from "../../test/integration-setup";
import { SEEDED_INVENTORY_IDS } from "../../test/seed-fixtures";

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

class Redirect extends Error {
  constructor(readonly url: string) {
    super(`redirect ${url}`);
  }
}
class NotFound extends Error {}
mock.module("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
  notFound: () => {
    throw new NotFound();
  },
  // The page's client components import it; nothing here renders them.
  useRouter: () => ({ push() {}, refresh() {} }),
}));

const { lookupInventoryTag } = await import("./inventory-tags");
const { default: InventoryTagPage } =
  await import("@/app/portal/(app)/t/[code]/page");

type Resolved = { redirect: string } | { notFound: true } | { rendered: true };

async function resolve(code: string, as: SupabaseClient): Promise<Resolved> {
  currentSupabase = as;
  try {
    await InventoryTagPage({
      params: Promise.resolve({ code }),
      searchParams: Promise.resolve({}),
    });
    return { rendered: true };
  } catch (error) {
    if (error instanceof Redirect) return { redirect: error.url };
    if (error instanceof NotFound) return { notFound: true };
    throw error;
  }
}

// Every code this file creates, removed through the service role at the end:
// a numbered code can't be deleted by anyone else (see the delete policy).
const createdTagIds: string[] = [];

async function generate(count: number, as: SupabaseClient = adminClient) {
  const { data, error } = await as.rpc("generate_numbered_inventory_tags", {
    p_count: count,
  });
  if (error) throw error;
  const rows = data as { id: string; number: number; value: string }[];
  createdTagIds.push(...rows.map((row) => row.id));
  return rows;
}

async function assign(itemId: string, code: string, move = false) {
  const { data, error } = await adminClient.rpc(
    "assign_numbered_inventory_tag",
    { p_item_id: itemId, p_code: code, p_move: move },
  );
  if (error) throw error;
  return data[0];
}

async function holderOf(tagId: string) {
  const { data } = await adminClient
    .from("inventory_item_tags")
    .select("item_id")
    .eq("id", tagId)
    .single();
  return data?.item_id ?? null;
}

async function assignments(itemId: string) {
  const { data, error } = await adminClient
    .from("inventory_item_tag_assignments")
    .select("tag_id, released_at, release_reason")
    .eq("item_id", itemId)
    .order("assigned_at");
  if (error) throw error;
  return data;
}

let itemIds: string[];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const fixture = await createAvailableGearItems(6);
  itemIds = fixture.itemIds;
  cleanup = fixture.cleanup;
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

describe("numbered codes (integration)", () => {
  test("the seeded tenant's codes carry its prefix and count up", async () => {
    const [first, second] = await generate(2);
    expect(first.value).toMatch(/^EXN-\d{3,}$/);
    expect(second.number).toBe(first.number + 1);
    expect(second.value).toBe(`EXN-${String(second.number).padStart(3, "0")}`);
  });

  test("two concurrent batches of ten get twenty distinct numbers", async () => {
    const other = await signInAs(SEEDED_USERS.admin);
    const [a, b] = await Promise.all([generate(10), generate(10, other)]);
    const numbers = new Set([...a, ...b].map((row) => row.number));
    expect(numbers.size).toBe(20);
  });

  test("the prefix is locked once codes exist", async () => {
    const { error } = await adminClient.rpc("set_inventory_tag_prefix", {
      p_prefix: "ABC",
    });
    expect(error?.message).toBe("INVENTORY_TAG_PREFIX_LOCKED");
  });

  test("a numbered code can't be deleted or renumbered by a session", async () => {
    const [code] = await generate(1);
    await adminClient.from("inventory_item_tags").delete().eq("id", code.id);
    expect(
      (
        await adminClient
          .from("inventory_item_tags")
          .select("id")
          .eq("id", code.id)
      ).data,
    ).toHaveLength(1);

    const { error } = await adminClient
      .from("inventory_item_tags")
      .update({ value: "EXN-999" })
      .eq("id", code.id);
    expect(error).not.toBeNull();
  });

  test("assign by bare number, move only after confirming, and keep both bindings", async () => {
    const [code] = await generate(1);
    const [a, b] = itemIds;

    expect(await assign(a, String(code.number))).toMatchObject({
      outcome: "assigned",
      code: code.value,
    });
    expect(await assign(a, code.value.toLowerCase())).toMatchObject({
      outcome: "already",
    });

    // Held by A: nothing moves until the caller says so.
    expect(await assign(b, code.value)).toMatchObject({
      outcome: "held",
      holder_item_id: a,
    });
    expect(await holderOf(code.id)).toBe(a);

    expect(await assign(b, code.value, true)).toMatchObject({
      outcome: "assigned",
    });
    expect(await holderOf(code.id)).toBe(b);

    const [aBinding] = await assignments(a);
    expect(aBinding.release_reason).toBe("moved");
    expect((await assignments(b))[0].released_at).toBeNull();
  });

  test("another tenant's prefix and unknown numbers assign nothing", async () => {
    const [code] = await generate(1);
    expect(
      await assign(itemIds[0], `ZZZ-${String(code.number).padStart(3, "0")}`),
    ).toMatchObject({ outcome: "unknown" });
    expect(await assign(itemIds[0], "999999")).toMatchObject({
      outcome: "unknown",
    });
  });

  test("an item given a second code gives up its first", async () => {
    const [first, second] = await generate(2);
    const item = itemIds[2];
    await assign(item, first.value);
    await assign(item, second.value);
    expect(await holderOf(first.id)).toBeNull();
    expect(await holderOf(second.id)).toBe(item);
    expect((await assignments(item))[0].release_reason).toBe("replaced");
  });

  test("distributing frees the code, says which, and the history keeps it", async () => {
    const [code] = await generate(1);
    const item = itemIds[3];
    await assign(item, code.value);

    const { data: movementId, error } = await adminClient.rpc(
      "record_event_distribution",
      {
        p_inventory_item_id: item,
        p_quantity: 1,
        p_reason: "Integration test",
      },
    );
    expect(error).toBeNull();
    expect(await holderOf(code.id)).toBeNull();

    const { data: released } = await adminClient.rpc(
      "released_numbered_inventory_tags",
      { p_movement_ids: [movementId!] },
    );
    expect(released).toEqual([
      expect.objectContaining({ item_id: item, code: code.value }),
    ]);

    const { data: history } = await adminClient.rpc("inventory_item_history", {
      p_item_id: item,
    });
    const tagEntries = ((history ?? []) as { entry_kind: string }[]).filter(
      (row) => row.entry_kind.startsWith("tag_"),
    );
    expect(tagEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entry_kind: "tag_assigned",
          reason: code.value,
        }),
        expect.objectContaining({
          entry_kind: "tag_released",
          reason: code.value,
          notes: "distributed",
        }),
      ]),
    );

    // An item that has left can't take a code again.
    expect(await assign(item, code.value)).toMatchObject({
      outcome: "item_gone",
    });
  });

  test("recording a scanned distribution returns the tags it freed", async () => {
    const [code] = await generate(1);
    const item = itemIds[4];
    await assign(item, code.value);

    await adminClient
      .from("inventory_distribution_drafts")
      .delete()
      .is("event_id", null);
    const { error: addError } = await adminClient.rpc(
      "add_to_distribution_draft",
      { p_item_id: item },
    );
    expect(addError).toBeNull();

    const { data, error } = await adminClient.rpc(
      "record_distribution_draft",
      {},
    );
    expect(error).toBeNull();
    expect(data?.[0]).toMatchObject({
      recorded: 1,
      released_tags: [expect.objectContaining({ code: code.value })],
    });
    expect(await holderOf(code.id)).toBeNull();
  });

  test("retiring through the status field frees the code; a random code stays", async () => {
    const [code] = await generate(1);
    const item = itemIds[5];
    await assign(item, code.value);

    const { error } = await adminClient
      .from("inventory_items")
      .update({ status: "retired" })
      .eq("id", item);
    expect(error).toBeNull();
    expect(await holderOf(code.id)).toBeNull();
    expect((await assignments(item)).at(-1)?.release_reason).toBe("retired");

    const { data: random } = await adminClient
      .from("inventory_item_tags")
      .select("item_id")
      .eq("item_id", item)
      .eq("kind", "asset_tag");
    expect(random).toHaveLength(1);
  });

  test("intake takes a free numbered code instead of making a random one", async () => {
    const [code] = await generate(1);
    const { data, error } = await adminClient.rpc(
      "create_donation_with_items",
      {
        p_donor_name: `Integration Test Donor ${crypto.randomUUID()}`,
        p_donor_is_anonymous: false,
        p_donor_source_type: "individual",
        p_donor_email: null,
        p_donor_phone: null,
        p_donor_notes: null,
        p_items: [
          {
            description: `Integration test item ${crypto.randomUUID()}`,
            category_key: "snowboard",
            condition: "good",
            asset_tag: String(code.number),
          },
        ],
      },
    );
    expect(error).toBeNull();
    const row = data![0];
    try {
      expect(row.asset_tags).toEqual([code.value]);
      expect(await holderOf(code.id)).toBe(row.inventory_item_ids[0]);
    } finally {
      const { cleanupDonation } = await import("../../test/integration-setup");
      await cleanupDonation(row.donation_id);
    }
  });

  test("sessions without inventory access read no codes or bindings", async () => {
    for (const { name, client } of await unprivilegedActors()) {
      const { data: tags } = await client
        .from("inventory_item_tags")
        .select("id")
        .eq("kind", "numbered");
      expect(tags ?? [], name).toEqual([]);
      const { data: bindings } = await client
        .from("inventory_item_tag_assignments")
        .select("id");
      expect(bindings ?? [], name).toEqual([]);
      const { error } = await client.rpc("generate_numbered_inventory_tags", {
        p_count: 1,
      });
      expect(error, name).not.toBeNull();
    }
  });
});

describe("/portal/t/[code] for a numbered code (integration)", () => {
  test("an assigned code opens its item, typed any way", async () => {
    // EXN-001 is on the seeded boots.
    for (const code of ["EXN-001", "exn-001"]) {
      expect(await resolve(code, adminClient)).toEqual({
        redirect: `/portal/inventory/items/${SEEDED_INVENTORY_IDS.boots}`,
      });
    }
  });

  test("a free code renders the assign page rather than not-found", async () => {
    // EXN-002 is seeded free.
    expect(await resolve("EXN-002", adminClient)).toEqual({ rendered: true });
    const { matches } = await lookupInventoryTag(adminClient, "EXN-002", {
      kinds: ["numbered"],
    });
    expect(matches[0]).toMatchObject({ kind: "numbered", item: null });
  });

  test("another tenant's prefix, an unknown number and no access are not-found", async () => {
    expect(await resolve("ZZZ-001", adminClient)).toEqual({ notFound: true });
    expect(await resolve("EXN-99999", adminClient)).toEqual({
      notFound: true,
    });
    const [, volunteer] = await unprivilegedActors();
    expect(await resolve("EXN-001", volunteer.client)).toEqual({
      notFound: true,
    });
  });
});
