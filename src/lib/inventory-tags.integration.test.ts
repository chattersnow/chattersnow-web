// Integration test (#1420): inventory_item_tags' RLS and code generation, the
// shared lookup helper, and the /portal/t/[code] resolver, against a real
// local Supabase stack. Requires `bun run db:start && bun run db:reset` first;
// run via `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  anonClient,
  createAvailableGearItems,
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
}));

const { lookupInventoryTag } = await import("./inventory-tags");
const { default: InventoryTagPage } =
  await import("@/app/portal/(app)/t/[code]/page");

// Generated codes: six characters with no 0/O or 1/I/L.
const GENERATED_CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/;

async function resolve(code: string, as: SupabaseClient) {
  currentSupabase = as;
  try {
    await InventoryTagPage({
      params: Promise.resolve({ code }),
      searchParams: Promise.resolve({}),
    });
  } catch (error) {
    if (error instanceof Redirect) return { redirect: error.url };
    if (error instanceof NotFound) return { notFound: true };
    throw error;
  }
  throw new Error("the resolver rendered instead of redirecting");
}

let itemId: string;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const fixture = await createAvailableGearItems(1);
  itemId = fixture.itemIds[0];
  cleanup = fixture.cleanup;
});

afterAll(async () => {
  await cleanup?.();
});

describe("inventory_item_tags (integration)", () => {
  test("an asset tag inserted without a value gets a generated code", async () => {
    const { data, error } = await adminClient
      .from("inventory_item_tags")
      .insert({ item_id: itemId, kind: "asset_tag", value: "" })
      .select("value")
      .single();
    expect(error).toBeNull();
    expect(data!.value).toMatch(GENERATED_CODE);
  });

  test("an item has at most one asset tag", async () => {
    const { error } = await adminClient
      .from("inventory_item_tags")
      .insert({ item_id: itemId, kind: "asset_tag", value: "" });
    expect(error?.code).toBe("23505");
  });

  test("a code is unique in the tenant, whatever case it is typed in", async () => {
    const { error } = await adminClient
      .from("inventory_item_tags")
      .insert({ item_id: null, kind: "asset_tag", value: "seed01" });
    expect(error?.code).toBe("23505");
  });

  test("a blank asset tag may wait for an item; a barcode may not", async () => {
    const { data: blank, error } = await adminClient
      .from("inventory_item_tags")
      .insert({ item_id: null, kind: "asset_tag", value: "" })
      .select("id")
      .single();
    expect(error).toBeNull();
    await adminClient.from("inventory_item_tags").delete().eq("id", blank!.id);

    const { error: barcodeError } = await adminClient
      .from("inventory_item_tags")
      .insert({ item_id: null, kind: "barcode", value: "012345678905" });
    expect(barcodeError?.code).toBe("23514");
  });

  test("one barcode may sit on several items", async () => {
    const { error } = await adminClient
      .from("inventory_item_tags")
      .insert({ item_id: itemId, kind: "barcode", value: "012345678905" });
    expect(error).toBeNull();

    const { matches } = await lookupInventoryTag(adminClient, "012345678905");
    const ids = matches.map((match) => match.item?.id);
    expect(ids).toContain(SEEDED_INVENTORY_IDS.jacket);
    expect(ids).toContain(itemId);
  });

  test("sessions without inventory access can neither read nor write tags", async () => {
    for (const { name, client } of await unprivilegedActors()) {
      const { data } = await client.from("inventory_item_tags").select("id");
      expect({ name, rows: data ?? [] }).toEqual({ name, rows: [] });

      const { error } = await client
        .from("inventory_item_tags")
        .insert({ item_id: itemId, kind: "nfc", value: "04:A2:3B:9C" });
      expect({ name, denied: error !== null }).toEqual({ name, denied: true });
    }
  });
});

describe("lookupInventoryTag (integration)", () => {
  test("finds the seeded item by code, URL or lower-case code", async () => {
    for (const scanned of [
      "SEED01",
      "seed01",
      "https://portal.example.org/portal/t/SEED01",
    ]) {
      const { matches, error } = await lookupInventoryTag(
        adminClient,
        scanned,
        { host: "portal.example.org" },
      );
      expect(error).toBe(false);
      expect(matches.map((match) => match.item?.id)).toEqual([
        SEEDED_INVENTORY_IDS.jacket,
      ]);
    }
  });

  test("a tag URL for another host finds nothing", async () => {
    const { matches } = await lookupInventoryTag(
      adminClient,
      "https://portal.other.org/portal/t/SEED01",
      { host: "portal.example.org" },
    );
    expect(matches).toEqual([]);
  });

  test("an unprivileged session finds nothing", async () => {
    for (const { client } of await unprivilegedActors()) {
      const { matches } = await lookupInventoryTag(client, "SEED01");
      expect(matches).toEqual([]);
    }
  });
});

describe("/portal/t/[code] (integration)", () => {
  test("a known code redirects to the item", async () => {
    expect(await resolve("seed02", adminClient)).toEqual({
      redirect: `/portal/inventory/items?item=${SEEDED_INVENTORY_IDS.boots}`,
    });
  });

  test("signed out goes to login and comes back", async () => {
    expect(await resolve("SEED02", anonClient())).toEqual({
      redirect: `/portal/login?next=${encodeURIComponent("/portal/t/SEED02")}`,
    });
  });

  test("an unknown code, a barcode and no permission are the same not-found", async () => {
    expect(await resolve("ZZZZZZ", adminClient)).toEqual({ notFound: true });
    // A URL only ever carries an asset-tag code.
    expect(await resolve("012345678905", adminClient)).toEqual({
      notFound: true,
    });
    for (const { name, client } of await unprivilegedActors()) {
      if (name === "anonymous") continue;
      expect({ name, ...(await resolve("SEED02", client)) }).toEqual({
        name,
        notFound: true,
      });
    }
  });
});
