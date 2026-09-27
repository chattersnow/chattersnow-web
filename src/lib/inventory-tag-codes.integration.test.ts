// Integration test (#1450): the Codes page's database side against a real
// local Supabase stack -- the list and its filters, recording printing and
// NFC writes on inventory:view, retiring a damaged or lost code and it being
// refused by assign, intake and the resolver, restoring it, one code's
// history, RLS, and tenant isolation. Requires
// `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  createAvailableGearItems,
  serviceRoleClient,
  signIn,
  signInAs,
  SEEDED_USERS,
  unprivilegedActors,
} from "../../test/integration-setup";
import { SEEDED_USER_IDS } from "../../test/seed-fixtures";

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
  useRouter: () => ({ push() {}, refresh() {} }),
}));

const { default: InventoryTagPage } =
  await import("@/app/portal/(app)/t/[code]/page");

async function resolves(code: string): Promise<"not_found" | "found"> {
  currentSupabase = adminClient;
  try {
    await InventoryTagPage({
      params: Promise.resolve({ code }),
      searchParams: Promise.resolve({}),
    });
    return "found";
  } catch (error) {
    if (error instanceof NotFound) return "not_found";
    if (error instanceof Redirect) return "found";
    throw error;
  }
}

type NewCode = { id: string; number: number; value: string };
type HistoryRow = {
  event: string;
  item_id: string | null;
  detail: string | null;
};

const run = crypto.randomUUID().slice(0, 8);
const createdTagIds: string[] = [];

async function generate(count: number) {
  const { data, error } = await adminClient.rpc(
    "generate_numbered_inventory_tags",
    { p_count: count },
  );
  if (error) throw error;
  const rows = data as NewCode[];
  createdTagIds.push(...rows.map((row) => row.id));
  return rows;
}

async function blanks(count: number) {
  const { data, error } = await adminClient.rpc("create_blank_asset_tags", {
    p_count: count,
  });
  if (error) throw error;
  const rows = data as { id: string; value: string }[];
  createdTagIds.push(...rows.map((row) => row.id));
  return rows;
}

async function tag(id: string) {
  const { data, error } = await adminClient
    .from("inventory_item_tags")
    .select(
      "item_id, value, print_count, last_printed_at, nfc_written_at, retired_at, retired_reason, retired_note",
    )
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

async function list(
  args: Record<string, unknown>,
  as: SupabaseClient = adminClient,
) {
  const { data, error } = await as.rpc("inventory_tag_codes", {
    p_limit: 500,
    ...args,
  });
  if (error) throw error;
  return data as { id: string; value: string; state: string }[];
}

/**
 * The board role holds `none` on inventory; granted `view` for one test, it
 * is the "can see and reprint, can't manage" reader the ticket describes.
 */
async function withInventoryViewer<T>(
  body: (client: SupabaseClient) => Promise<T>,
): Promise<T> {
  const { data: board } = await adminClient
    .from("roles")
    .select("id")
    .eq("name", "board")
    .single();
  const { data: resource } = await adminClient
    .from("resources")
    .select("id")
    .eq("key", "inventory")
    .single();
  if (!board || !resource) throw new Error("expected board and inventory");
  const grant = await adminClient
    .from("role_permissions")
    .upsert(
      { role_id: board.id, resource_id: resource.id, level: "view" },
      { onConflict: "role_id,resource_id" },
    );
  if (grant.error) throw grant.error;
  try {
    return await body(await signIn(SEEDED_USERS.board));
  } finally {
    await adminClient
      .from("role_permissions")
      .update({ level: "none" })
      .eq("role_id", board.id)
      .eq("resource_id", resource.id);
  }
}

let itemIds: string[];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const fixture = await createAvailableGearItems(3);
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

describe("the codes list (integration)", () => {
  test("filters free numbered codes never printed, and finds a code typed loosely", async () => {
    const [code] = await generate(1);
    const free = await list({
      p_kinds: ["numbered"],
      p_states: ["free"],
      p_never_printed: true,
    });
    expect(free.map((row) => row.id)).toContain(code.id);

    const found = await list({ p_search: "x", p_search_number: code.number });
    expect(found.map((row) => row.value)).toContain(code.value);

    const printed = await adminClient.rpc("record_inventory_labels_printed", {
      p_tag_ids: [code.id],
    });
    expect(printed.data).toBe(1);
    expect((await tag(code.id)).print_count).toBe(1);

    const again = await list({
      p_kinds: ["numbered"],
      p_states: ["free"],
      p_never_printed: true,
    });
    expect(again.map((row) => row.id)).not.toContain(code.id);
  });

  test("finds an item's codes by its description, and blanks as their own kind", async () => {
    const { data: item } = await adminClient
      .from("inventory_items")
      .select("description")
      .eq("id", itemIds[0])
      .single();
    const rows = await list({ p_search: item!.description });
    expect(rows.some((row) => row.state === "on_item")).toBe(true);

    const [blank] = await blanks(1);
    const blankRows = await list({ p_kinds: ["blank"], p_states: ["blank"] });
    expect(blankRows.map((row) => row.id)).toContain(blank.id);
  });

  test("sessions without inventory access list nothing", async () => {
    for (const { name, client } of await unprivilegedActors()) {
      const { data } = await client.rpc("inventory_tag_codes", {});
      expect(data ?? [], name).toEqual([]);
    }
  });
});

describe("printing and NFC tracking (integration)", () => {
  test("inventory:view records printing and NFC writes, and can't retire", async () => {
    const [code] = await generate(1);
    await withInventoryViewer(async (viewer) => {
      const printed = await viewer.rpc("record_inventory_labels_printed", {
        p_tag_ids: [code.id],
      });
      expect(printed.error).toBeNull();
      const written = await viewer.rpc("set_inventory_tags_nfc_written", {
        p_tag_ids: [code.id],
      });
      expect(written.data).toBe(1);

      const retired = await viewer.rpc("retire_inventory_tags", {
        p_tag_ids: [code.id],
        p_reason: "lost",
      });
      expect(retired.error).not.toBeNull();
    });
    const after = await tag(code.id);
    expect(after.print_count).toBe(1);
    expect(after.nfc_written_at).not.toBeNull();
    expect(after.retired_at).toBeNull();
  });

  test("the intake volunteer records printing from the Donations label page", async () => {
    const [blank] = await blanks(1);
    const volunteer = await signInAs(SEEDED_USERS.volunteer);
    const { data, error } = await volunteer.rpc(
      "record_inventory_labels_printed",
      { p_tag_ids: [blank.id] },
    );
    expect(error).toBeNull();
    expect(data).toBe(1);
  });

  test("no access records nothing", async () => {
    const [code] = await generate(1);
    for (const { name, client } of await unprivilegedActors()) {
      if (name === "volunteer") continue;
      const { error } = await client.rpc("record_inventory_labels_printed", {
        p_tag_ids: [code.id],
      });
      expect(error, name).not.toBeNull();
    }
    expect((await tag(code.id)).print_count).toBe(0);
  });

  test("a numbered code keeps its NFC mark across items, and its history shows both", async () => {
    const [code] = await generate(1);
    await adminClient.rpc("set_inventory_tags_nfc_written", {
      p_tag_ids: [code.id],
    });
    await adminClient.rpc("assign_numbered_inventory_tag", {
      p_item_id: itemIds[0],
      p_code: code.value,
    });
    await adminClient
      .from("inventory_items")
      .update({ status: "distributed" })
      .eq("id", itemIds[0]);
    await adminClient.rpc("assign_numbered_inventory_tag", {
      p_item_id: itemIds[1],
      p_code: code.value,
    });

    const after = await tag(code.id);
    expect(after.item_id).toBe(itemIds[1]);
    expect(after.nfc_written_at).not.toBeNull();

    const { data, error } = await adminClient.rpc("inventory_tag_history", {
      p_tag_id: code.id,
    });
    expect(error).toBeNull();
    const history = data as HistoryRow[];
    const events = history.map((entry) => [
      entry.event,
      entry.item_id,
      entry.detail,
    ]);
    // Newest first: on B, off A (distributed), on A, written, created.
    expect(events).toContainEqual(["assigned", itemIds[1], null]);
    expect(events).toContainEqual(["released", itemIds[0], "distributed"]);
    expect(events).toContainEqual(["assigned", itemIds[0], null]);
    expect(events.map(([event]) => event)).toContain("nfc_written");
    const order = history.map((entry) => entry.event);
    expect(order.indexOf("assigned")).toBeLessThan(order.indexOf("released"));
  });
});

describe("retiring a code (integration)", () => {
  test("a held numbered code comes off its item, and is refused everywhere", async () => {
    const [code] = await generate(1);
    await adminClient.rpc("assign_numbered_inventory_tag", {
      p_item_id: itemIds[2],
      p_code: code.value,
    });

    const { data, error } = await adminClient.rpc("retire_inventory_tags", {
      p_tag_ids: [code.id],
      p_reason: "lost",
      p_note: `Integration ${run}`,
    });
    expect(error).toBeNull();
    expect(data![0]).toMatchObject({ outcome: "retired", code: code.value });
    expect(data![0].released_from).toBeTruthy();

    const after = await tag(code.id);
    expect(after).toMatchObject({
      item_id: null,
      retired_reason: "lost",
      retired_note: `Integration ${run}`,
    });
    const { data: assignment } = await adminClient
      .from("inventory_item_tag_assignments")
      .select("release_reason")
      .eq("tag_id", code.id)
      .single();
    expect(assignment?.release_reason).toBe("retired");

    const assign = await adminClient.rpc("assign_numbered_inventory_tag", {
      p_item_id: itemIds[2],
      p_code: code.value,
    });
    expect(assign.data![0].outcome).toBe("retired");

    const scan = await adminClient.rpc("inventory_intake_scan", {
      p_asset_tag: code.value,
      p_barcode: "",
    });
    expect(scan.data![0].asset_tag_status).toBe("retired");

    const intake = await adminClient.rpc("create_donation_with_items", {
      p_donor_name: `Retired intake ${run}`,
      p_donor_is_anonymous: true,
      p_donor_source_type: "individual",
      p_donor_email: null,
      p_donor_phone: null,
      p_donor_notes: null,
      p_items: [
        {
          description: `Retired tag item ${run}`,
          condition: "good",
          asset_tag: code.value,
        },
      ],
    });
    expect(intake.error?.hint).toBe("asset_tag_unavailable");
    expect(intake.error?.message).toContain("retired");

    expect(await resolves(code.value)).toBe("not_found");

    // Found it: restored, free, and resolving again.
    const restored = await adminClient.rpc("unretire_inventory_tag", {
      p_tag_id: code.id,
    });
    expect(restored.data).toBe(code.value);
    expect((await tag(code.id)).retired_at).toBeNull();
    expect(await resolves(code.value)).toBe("found");

    const { data: history } = await adminClient.rpc("inventory_tag_history", {
      p_tag_id: code.id,
    });
    const events = (history as HistoryRow[]).map((entry) => entry.event);
    expect(events).toContain("retired");
    expect(events).toContain("unretired");
  });

  test("a retired blank is never bound at intake, and doesn't resolve", async () => {
    const [blank] = await blanks(1);
    await adminClient.rpc("retire_inventory_tags", {
      p_tag_ids: [blank.id],
      p_reason: "damaged",
    });
    const intake = await adminClient.rpc("create_donation_with_items", {
      p_donor_name: `Retired blank ${run}`,
      p_donor_is_anonymous: true,
      p_donor_source_type: "individual",
      p_donor_email: null,
      p_donor_phone: null,
      p_donor_notes: null,
      p_items: [
        {
          description: `Retired blank item ${run}`,
          condition: "good",
          asset_tag: blank.value,
        },
      ],
    });
    expect(intake.error?.hint).toBe("asset_tag_unavailable");
    expect(await resolves(blank.value)).toBe("not_found");
  });

  test("a random code on an item is reprinted, not retired", async () => {
    const { data: onItem } = await adminClient
      .from("inventory_item_tags")
      .select("id")
      .eq("kind", "asset_tag")
      .eq("item_id", itemIds[1])
      .single();
    const { data } = await adminClient.rpc("retire_inventory_tags", {
      p_tag_ids: [onItem!.id],
      p_reason: "lost",
    });
    expect(data![0].outcome).toBe("on_item");
    expect((await tag(onItem!.id)).retired_at).toBeNull();
  });

  test("a direct update can't leave a retired code on an item", async () => {
    const [code] = await generate(1);
    await adminClient.rpc("retire_inventory_tags", {
      p_tag_ids: [code.id],
      p_reason: "other",
    });
    const { error } = await adminClient
      .from("inventory_item_tags")
      .update({ item_id: itemIds[1] })
      .eq("id", code.id);
    expect(error?.message).toContain("inventory_item_tags_retired_unbound");
  });
});

describe("cross-tenant isolation (integration)", () => {
  const service = serviceRoleClient();
  let otherTenantId: string | null = null;

  afterAll(async () => {
    if (!otherTenantId) return;
    await service
      .from("inventory_item_tags")
      .delete()
      .eq("tenant_id", otherTenantId);
    await service.rpc("delete_tenant", { p_tenant_id: otherTenantId });
  });

  test("another tenant's code can't be listed, printed, marked, retired or read", async () => {
    // Archived at once, like the item-history suite's: a second active
    // tenant would change public_tenant_id() for every other file.
    const provisioned = await service.rpc("provision_tenant", {
      p_name: `Tag Codes Other ${run}`,
      p_slug: `tag-codes-other-${run}`,
      p_custom_domain: `tag-codes-other-${run}.example.test`,
      p_plan: "white_label",
      p_admin_email: null,
    });
    if (provisioned.error) throw provisioned.error;
    otherTenantId = provisioned.data as string;
    await service
      .from("tenants")
      .update({ status: "archived" })
      .eq("id", otherTenantId);

    const { data: foreign, error } = await service
      .from("inventory_item_tags")
      .insert({
        tenant_id: otherTenantId,
        item_id: null,
        kind: "asset_tag",
        value: "",
        created_by: SEEDED_USER_IDS.admin,
      })
      .select("id")
      .single();
    if (error) throw error;

    expect((await list({ p_ids: [foreign.id] })).length).toBe(0);
    expect(
      (
        await adminClient.rpc("record_inventory_labels_printed", {
          p_tag_ids: [foreign.id],
        })
      ).data,
    ).toBe(0);
    expect(
      (
        await adminClient.rpc("set_inventory_tags_nfc_written", {
          p_tag_ids: [foreign.id],
        })
      ).data,
    ).toBe(0);
    const retired = await adminClient.rpc("retire_inventory_tags", {
      p_tag_ids: [foreign.id],
      p_reason: "lost",
    });
    expect(retired.data![0].outcome).toBe("unknown");
    expect(
      (
        await adminClient.rpc("unretire_inventory_tag", {
          p_tag_id: foreign.id,
        })
      ).data,
    ).toBeNull();
    const history = await adminClient.rpc("inventory_tag_history", {
      p_tag_id: foreign.id,
    });
    expect(history.data).toEqual([]);

    const { data: untouched } = await service
      .from("inventory_item_tags")
      .select("print_count, nfc_written_at, retired_at")
      .eq("id", foreign.id)
      .single();
    expect(untouched).toEqual({
      print_count: 0,
      nfc_written_at: null,
      retired_at: null,
    });
  });

  test("the history of a code refuses a reader without inventory access", async () => {
    const [code] = await generate(1);
    for (const { name, client } of await unprivilegedActors()) {
      const { error } = await client.rpc("inventory_tag_history", {
        p_tag_id: code.id,
      });
      expect(error, name).not.toBeNull();
    }
  });
});
