// Integration test: `inventory_item_history` (#1442) against a real local
// Supabase stack -- the order and content of an item's history, that a
// reader who cannot read donations sees that the item was donated but not by
// whom, and that another tenant's item returns nothing. Requires
// `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  SEEDED_USERS,
  adminClient,
  cleanupDonation,
  createPublishedEvent,
  serviceRoleClient,
  signIn,
} from "../../../../../../../test/integration-setup";
import { SEEDED_USER_IDS } from "../../../../../../../test/seed-fixtures";
import type { ItemHistoryRow } from "./item-history";

const run = crypto.randomUUID().slice(0, 8);
const donorName = `History Donor ${run}`;
const recipientName = `History Recipient ${run}`;

let event: Awaited<ReturnType<typeof createPublishedEvent>>;
let donationId: string;
let itemId: string;
let recipientId: string;

async function history(
  client: typeof adminClient,
  id: string,
): Promise<ItemHistoryRow[]> {
  const { data, error } = await client.rpc("inventory_item_history", {
    p_item_id: id,
  });
  if (error) throw error;
  return data as unknown as ItemHistoryRow[];
}

beforeAll(async () => {
  event = await createPublishedEvent();

  const intake = await adminClient.rpc("create_donation_with_items", {
    p_donor_name: donorName,
    p_donor_is_anonymous: false,
    p_donor_source_type: "organization",
    p_donor_email: null,
    p_donor_phone: null,
    p_donor_notes: null,
    p_items: [
      {
        description: `History jacket ${run}`,
        category_key: "jacket",
        condition: "good",
      },
    ],
    p_event_id: event.id,
    p_donated_at: "2026-09-01",
  });
  if (intake.error) throw intake.error;
  donationId = intake.data![0].donation_id;
  itemId = intake.data![0].inventory_item_ids[0];

  const recipient = await adminClient
    .from("people")
    .insert({ name: recipientName, source_type: "individual" })
    .select("id")
    .single();
  if (recipient.error) throw recipient.error;
  recipientId = recipient.data.id;

  const movements = await adminClient.from("inventory_movements").insert([
    {
      inventory_item_id: itemId,
      movement_type: "reserved",
      quantity: 1,
      occurred_at: "2026-09-02T17:00:00Z",
      reason: "Held for pickup",
    },
    {
      inventory_item_id: itemId,
      movement_type: "distributed",
      quantity: 1,
      occurred_at: "2026-09-03T17:00:00Z",
      event_id: event.id,
      recipient_person_id: recipientId,
    },
  ]);
  if (movements.error) throw movements.error;
});

afterAll(async () => {
  if (donationId) await cleanupDonation(donationId);
  if (recipientId)
    await adminClient.from("people").delete().eq("id", recipientId);
  await event?.cleanup();
});

describe("inventory_item_history", () => {
  test("received at an event, reserved, then distributed: three entries, newest first", async () => {
    const rows = await history(adminClient, itemId);

    expect(rows.map((row) => row.movement_type ?? row.entry_kind)).toEqual([
      "distributed",
      "reserved",
      "donated",
    ]);

    const [distributed, reserved, donated] = rows;
    expect(distributed).toMatchObject({
      event_id: event.id,
      recipient_id: recipientId,
      recipient_name: recipientName,
      recorded_by: SEEDED_USER_IDS.admin,
    });
    expect(distributed.recorded_by_name).toBeTruthy();
    expect(reserved).toMatchObject({ reason: "Held for pickup" });
    expect(donated).toMatchObject({
      donation_id: donationId,
      donated_on: "2026-09-01",
      donor_name: donorName,
      donor_source_type: "organization",
      event_id: event.id,
      intake_route: "intake_form",
      recorded_by: SEEDED_USER_IDS.admin,
    });
    expect(donated.recorded_by_name).toBeTruthy();
  });

  test("a reader with inventory but not donations access sees that it was donated, not by whom", async () => {
    // The board role is `none` across inventory, finance and people. Granting
    // it the inventory catalog alone leaves `donations` (finance:view,
    // inventory:manage or inventory_intake:manage) unreadable.
    const { data: board } = await adminClient
      .from("roles")
      .select("id")
      .eq("name", "board")
      .single();
    const { data: resources } = await adminClient
      .from("resources")
      .select("id, key")
      .in("key", ["inventory", "inventory_reports"]);
    if (!board || !resources?.length) {
      throw new Error("expected the board role and inventory resources");
    }

    const grant = await adminClient.from("role_permissions").upsert(
      resources.map((resource) => ({
        role_id: board.id,
        resource_id: resource.id,
        level: "view",
      })),
      { onConflict: "role_id,resource_id" },
    );
    if (grant.error) throw grant.error;

    try {
      const client = await signIn(SEEDED_USERS.board);
      const rows = await history(client, itemId);
      const donated = rows.find((row) => row.entry_kind === "donated");

      expect(rows).toHaveLength(3);
      expect(donated).toMatchObject({
        donation_id: null,
        donor_id: null,
        donor_name: null,
        donated_on: null,
        intake_route: "intake_form",
      });
      // The intake movement still dates the entry for this reader.
      expect(donated!.occurred_at).toBeTruthy();
    } finally {
      await adminClient
        .from("role_permissions")
        .update({ level: "none" })
        .eq("role_id", board.id)
        .in(
          "resource_id",
          resources.map((resource) => resource.id),
        );
    }
  });

  test("a role without inventory access reads nothing", async () => {
    const client = await signIn(SEEDED_USERS.volunteer);
    expect(await history(client, itemId)).toEqual([]);
  });
});

describe("cross-tenant isolation", () => {
  const service = serviceRoleClient();
  let otherTenantId: string | null = null;

  // Archived the moment it exists and removed through `delete_tenant`, the
  // shape the donation import suite uses: a second *active* tenant would
  // take `public_tenant_id()` off its sole-active fallback for every other
  // file in the run.
  afterAll(async () => {
    if (!otherTenantId) return;
    await service
      .from("inventory_items")
      .delete()
      .eq("tenant_id", otherTenantId);
    await service.from("donations").delete().eq("tenant_id", otherTenantId);
    await service.from("people").delete().eq("tenant_id", otherTenantId);
    await service.rpc("delete_tenant", { p_tenant_id: otherTenantId });
  });

  test("another tenant's item returns no history", async () => {
    const provisioned = await service.rpc("provision_tenant", {
      p_name: `Item History Other ${run}`,
      p_slug: `item-history-other-${run}`,
      p_custom_domain: `item-history-other-${run}.example.test`,
      p_plan: "white_label",
      p_admin_email: null,
    });
    if (provisioned.error) throw provisioned.error;
    otherTenantId = provisioned.data as string;
    const archived = await service
      .from("tenants")
      .update({ status: "archived" })
      .eq("id", otherTenantId);
    if (archived.error) throw archived.error;

    const donor = await service
      .from("people")
      .insert({
        tenant_id: otherTenantId,
        name: `Other donor ${run}`,
        source_type: "individual",
      })
      .select("id")
      .single();
    if (donor.error) throw donor.error;
    const donation = await service
      .from("donations")
      .insert({
        tenant_id: otherTenantId,
        donor_id: donor.data.id,
        created_by: SEEDED_USER_IDS.admin,
      })
      .select("id")
      .single();
    if (donation.error) throw donation.error;
    const item = await service
      .from("inventory_items")
      .insert({
        tenant_id: otherTenantId,
        donation_id: donation.data.id,
        description: `Other tenant jacket ${run}`,
        condition: "good",
        created_by: SEEDED_USER_IDS.admin,
      })
      .select("id")
      .single();
    if (item.error) throw item.error;

    expect(await history(adminClient, item.data.id)).toEqual([]);
  });
});
