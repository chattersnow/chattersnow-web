// Integration test (#1420 part 4): tagging at intake. create_donation_with_items
// codes every item it creates, binds a scanned blank label, records a barcode;
// the intake-only helper functions answer the volunteer without handing over
// the catalog; and the /portal/t resolver offers an unused label only to
// someone who may receive with it. Against a real local Supabase stack; run via
// `bun run test:integration`.
import { afterAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  cleanupDonation,
  SEEDED_USERS,
  signIn,
} from "../../test/integration-setup";

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

const { default: InventoryTagPage } =
  await import("@/app/portal/(app)/t/[code]/page");

const GENERATED_CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/;

const volunteer = await signIn(SEEDED_USERS.volunteer);
const board = await signIn(SEEDED_USERS.board);

const donations: string[] = [];
const blankTagIds: string[] = [];

afterAll(async () => {
  for (const id of donations) await cleanupDonation(id);
  if (blankTagIds.length) {
    await adminClient
      .from("inventory_item_tags")
      .delete()
      .in("id", blankTagIds);
  }
});

type Item = { asset_tag?: string; barcode?: string; description?: string };

async function receive(as: SupabaseClient, items: Item[]) {
  const result = await as.rpc("create_donation_with_items", {
    p_donor_name: "Intake Tag Donor",
    p_donor_is_anonymous: false,
    p_donor_source_type: "individual",
    p_donor_email: "",
    p_donor_phone: "",
    p_donor_notes: "",
    p_items: items.map((item) => ({
      description: item.description ?? "Tagged jacket",
      category_key: "",
      type: "Jacket",
      condition: "good",
      intended_use: "gear_library",
      asset_tag: item.asset_tag ?? null,
      barcode: item.barcode ?? null,
    })),
  });
  const row = result.data?.[0];
  if (row) donations.push(row.donation_id);
  return { row, error: result.error };
}

async function blanks(as: SupabaseClient, count: number) {
  const { data, error } = await as.rpc("create_blank_asset_tags", {
    p_count: count,
  });
  expect(error).toBeNull();
  const rows = data as { id: string; value: string }[];
  blankTagIds.push(...rows.map((tag) => tag.id));
  return rows.map((tag) => tag.value);
}

async function resolve(code: string, as: SupabaseClient) {
  currentSupabase = as;
  try {
    return {
      rendered: await InventoryTagPage({
        params: Promise.resolve({ code }),
        searchParams: Promise.resolve({}),
      }),
    };
  } catch (error) {
    if (error instanceof Redirect) return { redirect: error.url };
    if (error instanceof NotFound) return { notFound: true };
    throw error;
  }
}

describe("tagging at intake (integration)", () => {
  test("an intake-only volunteer's donation of three items returns three codes", async () => {
    const { row, error } = await receive(volunteer, [{}, {}, {}]);
    expect(error).toBeNull();
    expect(row!.asset_tags).toHaveLength(3);
    for (const code of row!.asset_tags) expect(code).toMatch(GENERATED_CODE);
    expect(new Set(row!.asset_tags).size).toBe(3);

    const { data: tags } = await adminClient
      .from("inventory_item_tags")
      .select("item_id, value")
      .eq("kind", "asset_tag")
      .in("item_id", row!.inventory_item_ids);
    const byItem = new Map(
      (tags as { item_id: string; value: string }[]).map((tag) => [
        tag.item_id,
        tag.value,
      ]),
    );
    expect(row!.inventory_item_ids.map((id: string) => byItem.get(id))).toEqual(
      row!.asset_tags,
    );
  });

  test("a scanned blank label is bound to the new item instead of a new code", async () => {
    const [code] = await blanks(volunteer, 1);
    const { row, error } = await receive(volunteer, [
      { asset_tag: code.toLowerCase() },
    ]);
    expect(error).toBeNull();
    expect(row!.asset_tags).toEqual([code]);

    const { data: tag } = await adminClient
      .from("inventory_item_tags")
      .select("item_id")
      .eq("kind", "asset_tag")
      .eq("value", code)
      .single();
    expect(tag!.item_id).toBe(row!.inventory_item_ids[0]);
  });

  test("a label already on an item fails the whole donation", async () => {
    const [code] = await blanks(volunteer, 1);
    await receive(volunteer, [{ asset_tag: code }]);

    const before = donations.length;
    const { row, error } = await receive(volunteer, [{}, { asset_tag: code }]);
    expect(row).toBeUndefined();
    expect(error?.hint).toBe("asset_tag_unavailable");
    expect(donations.length).toBe(before);
  });

  test("a manufacturer barcode is recorded, and a later scan of it prefills from that item", async () => {
    const barcode = `0${Date.now()}`.slice(0, 13);
    const { row } = await receive(volunteer, [
      { barcode, description: "Burton gloves, black" },
    ]);
    const { data: tag } = await adminClient
      .from("inventory_item_tags")
      .select("item_id")
      .eq("kind", "barcode")
      .eq("value", barcode)
      .single();
    expect(tag!.item_id).toBe(row!.inventory_item_ids[0]);

    const { data } = await volunteer.rpc("inventory_intake_scan", {
      p_asset_tag: "",
      p_barcode: barcode,
    });
    expect(data![0]).toMatchObject({
      barcode_known: true,
      barcode_description: "Burton gloves, black",
    });
  });

  test("inventory_intake_scan names a label blank, assigned or unknown, and refuses a board member", async () => {
    const [blank] = await blanks(volunteer, 1);
    const { row } = await receive(volunteer, [{}]);
    const assigned = row!.asset_tags[0];

    const status = async (code: string) =>
      (
        await volunteer.rpc("inventory_intake_scan", {
          p_asset_tag: code,
          p_barcode: "",
        })
      ).data![0].asset_tag_status;
    expect(await status(blank)).toBe("blank");
    expect(await status(assigned)).toBe("assigned");
    expect(await status("ZZZZZZ")).toBe("unknown");

    const refused = await board.rpc("inventory_intake_scan", {
      p_asset_tag: blank,
      p_barcode: "",
    });
    expect(refused.error).not.toBeNull();
  });

  test("inventory_intake_labels reads a donation's labels, and blank codes only while unused", async () => {
    const { row } = await receive(volunteer, [
      { description: "Label one" },
      { description: "Label two" },
    ]);
    const { data: donationLabels } = await volunteer.rpc(
      "inventory_intake_labels",
      { p_donation_id: row!.donation_id, p_codes: null as unknown as string[] },
    );
    expect(
      donationLabels!.map(
        (label: { code: string; description: string | null }) => label.code,
      ),
    ).toEqual(row!.asset_tags);
    expect(
      donationLabels!.map(
        (label: { code: string; description: string | null }) =>
          label.description,
      ),
    ).toEqual(["Label one", "Label two"]);

    const [unused, used] = await blanks(volunteer, 2);
    await receive(volunteer, [{ asset_tag: used }]);
    const { data: blankLabels } = await volunteer.rpc(
      "inventory_intake_labels",
      { p_donation_id: null as unknown as string, p_codes: [unused, used] },
    );
    expect(
      blankLabels!.map(
        (label: { code: string; description: string | null }) => label.code,
      ),
    ).toEqual([unused]);
  });

  test("the resolver offers an unused label to intake and a not-found to anyone else", async () => {
    const [code] = await blanks(volunteer, 1);

    const offered = await resolve(code, volunteer);
    // The blank-label offer, for this code, rather than a redirect.
    expect(
      (offered as { rendered: { props: { code: string } } }).rendered.props,
    ).toEqual({ code });

    expect(await resolve(code, board)).toEqual({ notFound: true });
  });
});
