// Integration test for #1519's emailed fallback, against the real RPCs on a
// local Supabase stack: a handout recorded with a reason writes a link in the
// same transaction, the recipient follows it on the shared /acknowledge RPC
// pair (anon) and the acknowledgement lands beside the reason, and every dead
// link reads LINK_INVALID. Requires `bun run db:start && bun run db:reset`;
// run via `bun run test:integration`.
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import { mintConfirmationToken } from "@/lib/notifications/notification-email-token";
import {
  adminClient,
  anonClient,
  createAvailableGearItems,
  createPerson,
  serviceRoleClient,
  uniqueIp,
} from "../../test/integration-setup";

const service = serviceRoleClient();
const anon = anonClient();
const AS_IS = "We give away everything as-is.";
let cleanupItems: () => Promise<void>;
const cleanups: (() => Promise<void>)[] = [];

let itemIds: string[];

async function clearDrafts() {
  await adminClient
    .from("inventory_distribution_drafts")
    .delete()
    .not("id", "is", null);
}

beforeAll(async () => {
  const items = await createAvailableGearItems(7);
  itemIds = items.itemIds;
  cleanupItems = items.cleanup;
  await clearDrafts();
});

afterEach(clearDrafts);

afterAll(async () => {
  await clearDrafts();
  await cleanupItems?.();
  while (cleanups.length) await cleanups.pop()!();
});

async function person(name = "Robin Example") {
  const fixture = await createPerson({
    name,
    email: `robin-${crypto.randomUUID()}@example.com`,
  });
  cleanups.push(fixture.cleanup);
  return fixture.id;
}

async function draftWith(ids: string[], recipientId?: string) {
  for (const id of ids) {
    const { error } = await adminClient.rpc("add_to_distribution_draft", {
      p_item_id: id,
    });
    if (error) throw error;
  }
  if (recipientId) {
    const { error } = await adminClient.rpc(
      "set_distribution_draft_recipient",
      { p_person_id: recipientId },
    );
    if (error) throw error;
  }
}

/** Records the open handout with a reason, asking for a link. */
async function recordWithLink(reason = "left_before_acknowledging") {
  const { hash } = mintConfirmationToken();
  const { data, error } = await adminClient.rpc("record_distribution_draft", {
    p_skipped_reason: reason,
    p_link_token_hash: hash,
  });
  if (error) throw error;
  return { hash, row: data?.[0] };
}

function view(hash: string) {
  return anon.rpc("get_as_is_acknowledgement", {
    p_token_hash: hash,
    p_ip_address: uniqueIp(),
  });
}

function acknowledge(hash: string, name = "Robin Example") {
  return anon.rpc("acknowledge_as_is_by_token", {
    p_token_hash: hash,
    p_acknowledged: true,
    p_typed_name: name,
    p_as_is_text: AS_IS,
    p_ip_address: uniqueIp(),
  });
}

async function acknowledgementOf(itemId: string) {
  const { data, error } = await service
    .from("inventory_movements")
    .select(
      "ack:distribution_acknowledgements!inventory_movements_distribution_acknowledgement_in_tenant(id, acknowledged_at, as_is_text, typed_name, method, skipped_reason)",
    )
    .eq("movement_type", "distributed")
    .eq("inventory_item_id", itemId)
    .single();
  if (error) throw error;
  // A to-one embed, typed as an array by the composite FK.
  return Array.isArray(data.ack) ? data.ack[0] : data.ack;
}

describe("the emailed link", () => {
  test("is written with the record, opens the handout and is acknowledged once beside the reason", async () => {
    const recipient = await person();
    await draftWith([itemIds[0], itemIds[1]], recipient);
    const { hash, row } = await recordWithLink();
    expect(row?.recorded).toBe(2);
    expect(row?.link_expires_at).toEqual(expect.any(String));

    const page = await view(hash);
    expect(page.error).toBeNull();
    expect(page.data).toMatchObject({
      kind: "handout_link",
      first_name: "Robin",
      items: [
        expect.objectContaining({ description: expect.any(String) }),
        expect.objectContaining({ description: expect.any(String) }),
      ],
    });
    expect(JSON.stringify(page.data)).not.toContain("@");

    const result = await acknowledge(hash);
    expect(result.error).toBeNull();
    expect(result.data).toBe("handout_link");

    expect(await acknowledgementOf(itemIds[0])).toMatchObject({
      acknowledged_at: expect.any(String),
      as_is_text: AS_IS,
      typed_name: "Robin Example",
      method: "emailed_link",
      skipped_reason: "left_before_acknowledging",
    });

    const { data: history } = await adminClient.rpc("inventory_item_history", {
      p_item_id: itemIds[1],
    });
    expect(
      (history as { movement_type: string | null }[]).find(
        (entry) => entry.movement_type === "distributed",
      ),
    ).toMatchObject({
      as_is_typed_name: "Robin Example",
      as_is_method: "emailed_link",
      as_is_skipped_reason: "left_before_acknowledging",
    });

    // One-time.
    expect((await view(hash)).error?.message).toBe("LINK_INVALID");
    expect((await acknowledge(hash)).error?.message).toBe("LINK_INVALID");
  });

  test("is not written without a reason or without a recipient", async () => {
    // Acknowledged at the checkout: nothing to ask for afterwards.
    const recipient = await person();
    await draftWith([itemIds[2]], recipient);
    const qr = mintConfirmationToken();
    await adminClient.rpc("issue_distribution_acknowledgement_token", {
      p_event_id: null,
      p_token_hash: qr.hash,
    });
    await anon.rpc("acknowledge_distribution_by_token", {
      p_token_hash: qr.hash,
      p_acknowledged: true,
      p_typed_name: "Robin Example",
      p_as_is_text: AS_IS,
      p_ip_address: uniqueIp(),
    });
    const { hash } = mintConfirmationToken();
    const acknowledged = await adminClient.rpc("record_distribution_draft", {
      p_link_token_hash: hash,
    });
    expect(acknowledged.error).toBeNull();
    expect(acknowledged.data?.[0]?.link_expires_at).toBeNull();

    // Nobody to write to.
    await draftWith([itemIds[3]]);
    const anonymous = await recordWithLink("no_phone");
    expect(anonymous.row?.link_expires_at).toBeNull();
    expect((await view(anonymous.hash)).error?.message).toBe("LINK_INVALID");
  });

  test("a malformed hash refuses the whole record", async () => {
    await draftWith([itemIds[4]], await person());
    const { error } = await adminClient.rpc("record_distribution_draft", {
      p_skipped_reason: "no_phone",
      p_link_token_hash: "not-a-hash",
    });
    expect(error?.message).toBe("TOKEN_INVALID");
  });

  test("an expired link, or a recipient anonymized since, is dead", async () => {
    const recipient = await person();
    await draftWith([itemIds[4]], recipient);
    const expired = await recordWithLink("declined_to_wait");
    await service
      .from("distribution_acknowledgement_requests")
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("token_hash", expired.hash);
    expect((await view(expired.hash)).error?.message).toBe("LINK_INVALID");
    expect((await acknowledge(expired.hash)).error?.message).toBe(
      "LINK_INVALID",
    );

    await draftWith([itemIds[5]], recipient);
    const anonymized = await recordWithLink();
    const ack = await acknowledgementOf(itemIds[5]);
    await service
      .from("distribution_acknowledgements")
      .update({ recipient_person_id: null })
      .eq("id", ack!.id);
    expect((await view(anonymized.hash)).error?.message).toBe("LINK_INVALID");
  });

  test("staff cannot read the hash or write a link", async () => {
    const hidden = await adminClient
      .from("distribution_acknowledgement_requests")
      .select("token_hash");
    expect(hidden.error).not.toBeNull();

    const { hash } = mintConfirmationToken();
    const forged = await adminClient
      .from("distribution_acknowledgement_requests")
      .insert({
        acknowledgement_id: crypto.randomUUID(),
        token_hash: hash,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      });
    expect(forged.error).not.toBeNull();
  });

  test("a request from before #1367 the handout fulfilled is written back", async () => {
    const recipient = await person();
    const { data: request, error } = await service
      .from("gear_requests")
      .insert({ person_id: recipient, delivery_method: "meetup" })
      .select("id")
      .single();
    if (error) throw error;
    cleanups.push(async () => {
      await service.from("gear_requests").delete().eq("id", request.id);
    });
    const hold = await service.from("inventory_movements").insert({
      inventory_item_id: itemIds[6],
      movement_type: "reserved",
      quantity: 1,
      recipient_person_id: recipient,
      gear_request_id: request.id,
    });
    if (hold.error) throw hold.error;
    await service
      .from("inventory_items")
      .update({ status: "reserved" })
      .eq("id", itemIds[6]);

    await draftWith([itemIds[6]], recipient);
    const { hash } = await recordWithLink();
    expect((await acknowledge(hash, "Robin E.")).error).toBeNull();

    const { data: after } = await service
      .from("gear_requests")
      .select(
        "as_is_acknowledged_at, as_is_text, as_is_method, as_is_typed_name",
      )
      .eq("id", request.id)
      .single();
    expect(after).toMatchObject({
      as_is_acknowledged_at: expect.any(String),
      as_is_text: AS_IS,
      as_is_method: "emailed_link",
      as_is_typed_name: "Robin E.",
    });
  });
});
