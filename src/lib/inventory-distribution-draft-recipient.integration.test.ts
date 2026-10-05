// Integration test (#1443): the recipient a distribution draft keeps, its RLS,
// moving a draft between events, and the tag resolver naming the recipient,
// against a real local Supabase stack. Requires
// `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  createAvailableGearItems,
  createPerson,
  createPublishedEvent,
  signInAs,
  SEEDED_USERS,
} from "../../test/integration-setup";

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));
mock.module("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect ${url}`);
  },
  notFound: () => {
    throw new Error("not found");
  },
  // The tag page's client components import it; nothing here renders them.
  useRouter: () => ({ push() {}, refresh() {} }),
}));

const { getDistributionDraft, getCurrentDistributionDraft } =
  await import("./inventory-distribution-draft");
const { default: InventoryTagPage } =
  await import("@/app/portal/(app)/t/[code]/page");

async function clearDrafts() {
  await adminClient
    .from("inventory_distribution_drafts")
    .delete()
    .not("id", "is", null);
}

async function movementRecipients(itemIds: string[], reason: string) {
  const { data, error } = await adminClient
    .from("inventory_movements")
    .select("inventory_item_id, recipient_person_id")
    .in("inventory_item_id", itemIds)
    .eq("movement_type", "distributed")
    .eq("reason", reason);
  if (error) throw error;
  return data;
}

let itemIds: string[];
let cleanupItems: () => Promise<void>;
let eventId: string;
let cleanupEvent: () => Promise<void>;
let recipient: { id: string; name: string; cleanup: () => Promise<void> };
let coordinator: SupabaseClient;

beforeAll(async () => {
  const items = await createAvailableGearItems(5);
  itemIds = items.itemIds;
  cleanupItems = items.cleanup;
  const event = await createPublishedEvent();
  eventId = event.id;
  cleanupEvent = event.cleanup;
  const name = `Draft Recipient ${crypto.randomUUID().slice(0, 8)}`;
  recipient = { ...(await createPerson({ name })), name };
  coordinator = await signInAs(SEEDED_USERS.coordinator);
  await clearDrafts();
});

afterEach(async () => {
  await clearDrafts();
});

afterAll(async () => {
  await clearDrafts();
  await cleanupEvent?.();
  await cleanupItems?.();
  await recipient?.cleanup();
});

describe("a distribution draft's recipient (integration)", () => {
  test("setting a recipient creates the draft and is read back with it", async () => {
    const { error } = await adminClient.rpc(
      "set_distribution_draft_recipient",
      { p_event_id: eventId, p_person_id: recipient.id },
    );
    expect(error).toBeNull();

    const { draft } = await getDistributionDraft(adminClient, eventId);
    expect(draft?.recipient?.id).toBe(recipient.id);
    expect(draft?.recipient?.name).toBe(recipient.name);
    expect(draft?.items).toEqual([]);

    // Clearing it keeps the list.
    await adminClient.rpc("add_to_distribution_draft", {
      p_item_id: itemIds[0],
      p_event_id: eventId,
    });
    await adminClient.rpc("set_distribution_draft_recipient", {
      p_event_id: eventId,
    });
    const cleared = await getDistributionDraft(adminClient, eventId);
    expect(cleared.draft?.recipient).toBeNull();
    expect(cleared.draft?.items).toHaveLength(1);
  });

  test("another person can neither read nor set someone else's recipient", async () => {
    await adminClient.rpc("set_distribution_draft_recipient", {
      p_person_id: recipient.id,
    });

    const { data } = await coordinator
      .from("inventory_distribution_drafts")
      .select("recipient_person_id");
    expect(data ?? []).toEqual([]);

    // The coordinator's own call writes the coordinator's own draft -- or is
    // refused outright -- and never touches the admin's.
    await coordinator
      .from("inventory_distribution_drafts")
      .update({ recipient_person_id: null })
      .not("id", "is", null);
    const { draft } = await getDistributionDraft(adminClient, null);
    expect(draft?.recipient?.id).toBe(recipient.id);
  });

  test("recording without a recipient argument records for the stored one", async () => {
    await adminClient.rpc("set_distribution_draft_recipient", {
      p_person_id: recipient.id,
    });
    for (const id of itemIds.slice(0, 2)) {
      await adminClient.rpc("add_to_distribution_draft", { p_item_id: id });
    }

    const reason = `recipient default ${crypto.randomUUID()}`;
    const { data, error } = await adminClient.rpc("record_distribution_draft", {
      p_reason: reason,
      p_skipped_reason: "declined_to_wait",
    });
    expect(error).toBeNull();
    expect(data?.[0]?.recorded).toBe(2);
    const rows = await movementRecipients(itemIds.slice(0, 2), reason);
    expect(rows.map((row) => row.recipient_person_id)).toEqual([
      recipient.id,
      recipient.id,
    ]);
  });

  test("moving a draft to another event merges it into the list already there", async () => {
    await adminClient.rpc("add_to_distribution_draft", {
      p_item_id: itemIds[2],
    });
    await adminClient.rpc("set_distribution_draft_recipient", {
      p_person_id: recipient.id,
    });
    await adminClient.rpc("add_to_distribution_draft", {
      p_item_id: itemIds[2],
      p_event_id: eventId,
    });
    await adminClient.rpc("add_to_distribution_draft", {
      p_item_id: itemIds[3],
      p_event_id: eventId,
    });

    const { error } = await adminClient.rpc("move_distribution_draft", {
      p_to_event_id: eventId,
    });
    expect(error).toBeNull();

    expect((await getDistributionDraft(adminClient, null)).draft).toBeNull();
    const { draft } = await getDistributionDraft(adminClient, eventId);
    expect(draft?.items.map((item) => item.id).sort()).toEqual(
      [itemIds[2], itemIds[3]].sort(),
    );
    expect(draft?.recipient?.id).toBe(recipient.id);
  });

  test("moving to an event with no list just re-keys the draft", async () => {
    await adminClient.rpc("add_to_distribution_draft", {
      p_item_id: itemIds[2],
      p_event_id: eventId,
    });
    await adminClient.rpc("move_distribution_draft", {
      p_from_event_id: eventId,
    });
    expect((await getDistributionDraft(adminClient, eventId)).draft).toBeNull();
    expect(
      (await getDistributionDraft(adminClient, null)).draft?.items,
    ).toHaveLength(1);
  });

  test("the tag resolver names the recipient of the list in progress", async () => {
    await adminClient.rpc("add_to_distribution_draft", {
      p_item_id: itemIds[2],
    });
    await adminClient.rpc("set_distribution_draft_recipient", {
      p_person_id: recipient.id,
    });
    const { data: tag } = await adminClient
      .from("inventory_item_tags")
      .select("value")
      .eq("item_id", itemIds[4])
      .eq("kind", "asset_tag")
      .single();

    currentSupabase = adminClient;
    const page = await InventoryTagPage({
      params: Promise.resolve({ code: tag!.value }),
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(page as ReactElement);
    expect(html).toContain(`Add to your distribution for ${recipient.name}`);

    const current = await getCurrentDistributionDraft(adminClient);
    expect(current?.recipient?.id).toBe(recipient.id);
  });
});
