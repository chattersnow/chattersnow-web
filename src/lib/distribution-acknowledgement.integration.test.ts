// Integration test for the in-person handout checkout (#1519), against the
// real RPCs on a local Supabase stack: the one-time QR token on the draft,
// the recipient acknowledging on their own phone (anon) or the staff device,
// staff never writing the acknowledgement themselves, the recipient change
// voiding it, the ack-or-reason gate on recording, and meetup requests.
// Requires `bun run db:start && bun run db:reset`; run via
// `bun run test:integration`.
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
// Items (and their movements) go first, then the requests and people the
// movements pointed at.
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
  const items = await createAvailableGearItems(10);
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
  const fixture = await createPerson({ name });
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

async function issueToken() {
  const { token, hash } = mintConfirmationToken();
  const { error } = await adminClient.rpc(
    "issue_distribution_acknowledgement_token",
    { p_event_id: null, p_token_hash: hash },
  );
  if (error) throw error;
  return { token, hash };
}

function acknowledgeByToken(
  hash: string,
  overrides: { acknowledged?: boolean; name?: string; text?: string } = {},
) {
  return anon.rpc("acknowledge_distribution_by_token", {
    p_token_hash: hash,
    p_acknowledged: overrides.acknowledged ?? true,
    p_typed_name: overrides.name ?? "Robin Example",
    p_as_is_text: overrides.text ?? AS_IS,
    p_ip_address: uniqueIp(),
  });
}

type HistoryRow = { movement_type: string | null };

/** The distribution entry of an item's history. */
function distributed(history: unknown) {
  return (history as HistoryRow[] | null)?.find(
    (row) => row.movement_type === "distributed",
  );
}

async function draftAck() {
  const { data, error } = await adminClient
    .from("inventory_distribution_drafts")
    .select("ack_acknowledged_at, ack_typed_name, ack_method, ack_as_is_text")
    .is("event_id", null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

describe("the one-time code", () => {
  test("the recipient's phone sees the handout and acknowledges it once", async () => {
    const recipient = await person("Robin Example");
    await draftWith([itemIds[0]], recipient);
    const { hash } = await issueToken();

    const page = await anon.rpc("get_distribution_acknowledgement", {
      p_token_hash: hash,
      p_ip_address: uniqueIp(),
    });
    expect(page.error).toBeNull();
    expect(page.data).toMatchObject({
      first_name: "Robin",
      items: [expect.objectContaining({ description: expect.any(String) })],
    });
    // Nothing about the recipient but a first name.
    expect(JSON.stringify(page.data)).not.toContain("@");

    expect((await acknowledgeByToken(hash)).error).toBeNull();
    expect(await draftAck()).toEqual({
      ack_acknowledged_at: expect.any(String),
      ack_typed_name: "Robin Example",
      ack_method: "own_device",
      ack_as_is_text: AS_IS,
    });

    // One-time: the same code is dead now.
    expect((await acknowledgeByToken(hash)).error?.message).toBe(
      "LINK_INVALID",
    );
  });

  test("refuses an unticked box, a missing name, and missing words", async () => {
    await draftWith([itemIds[1]]);
    const { hash } = await issueToken();

    expect(
      (await acknowledgeByToken(hash, { acknowledged: false })).error?.message,
    ).toBe("AS_IS_REQUIRED");
    expect(
      (await acknowledgeByToken(hash, { name: "  " })).error?.message,
    ).toBe("NAME_REQUIRED");
    expect((await acknowledgeByToken(hash, { text: "" })).error?.message).toBe(
      "AS_IS_TEXT_REQUIRED",
    );
    expect(await draftAck()).toMatchObject({ ack_acknowledged_at: null });
  });

  test("a new code supersedes the last; an unknown one looks the same", async () => {
    await draftWith([itemIds[1]]);
    const first = await issueToken();
    await issueToken();

    expect((await acknowledgeByToken(first.hash)).error?.message).toBe(
      "LINK_INVALID",
    );
    expect(
      (await acknowledgeByToken(mintConfirmationToken().hash)).error?.message,
    ).toBe("LINK_INVALID");
  });

  test("changing the recipient voids the code and the acknowledgement", async () => {
    const first = await person("First Person");
    const second = await person("Second Person");
    await draftWith([itemIds[1]], first);
    const { hash } = await issueToken();
    expect((await acknowledgeByToken(hash)).error).toBeNull();

    // Adding a piece afterwards keeps it.
    await draftWith([itemIds[2]]);
    expect((await draftAck())?.ack_method).toBe("own_device");

    await adminClient.rpc("set_distribution_draft_recipient", {
      p_person_id: second,
    });
    expect(await draftAck()).toMatchObject({
      ack_acknowledged_at: null,
      ack_typed_name: null,
    });

    const next = await issueToken();
    await adminClient.rpc("set_distribution_draft_recipient", {
      p_person_id: first,
    });
    expect((await acknowledgeByToken(next.hash)).error?.message).toBe(
      "LINK_INVALID",
    );
  });

  test("staff cannot write the acknowledgement or read the token", async () => {
    await draftWith([itemIds[1]]);
    await issueToken();

    const write = await adminClient
      .from("inventory_distribution_drafts")
      .update({
        ack_acknowledged_at: new Date().toISOString(),
        ack_typed_name: "Staff",
        ack_method: "staff_device",
        ack_as_is_text: AS_IS,
      } as never)
      .is("event_id", null);
    expect(write.error?.code).toBe("42501");

    const read = await adminClient
      .from("inventory_distribution_drafts")
      .select("ack_token_hash" as never);
    expect(read.error?.code).toBe("42501");

    const insert = await adminClient
      .from("distribution_acknowledgements")
      .insert({ skipped_reason: "other" } as never);
    expect(insert.error).not.toBeNull();
  });

  test("the staff device records itself as such", async () => {
    await draftWith([itemIds[1]]);
    const view = await adminClient.rpc(
      "get_distribution_acknowledgement_on_staff_device",
      {},
    );
    expect(view.error).toBeNull();

    const { error } = await adminClient.rpc(
      "acknowledge_distribution_on_staff_device",
      {
        p_event_id: null,
        p_acknowledged: true,
        p_typed_name: "Robin Example",
        p_as_is_text: AS_IS,
      },
    );
    expect(error).toBeNull();
    expect((await draftAck())?.ack_method).toBe("staff_device");
  });
});

describe("recording", () => {
  test("needs the acknowledgement or a reason, and links every movement to it", async () => {
    const recipient = await person();
    await draftWith([itemIds[3], itemIds[4]], recipient);

    const refused = await adminClient.rpc("record_distribution_draft", {});
    expect(refused.error?.message).toBe("ACKNOWLEDGEMENT_REQUIRED");
    const noNote = await adminClient.rpc("record_distribution_draft", {
      p_skipped_reason: "other",
    });
    expect(noNote.error?.message).toBe("SKIP_REASON_INVALID");

    const { hash } = await issueToken();
    await acknowledgeByToken(hash);
    const { data, error } = await adminClient.rpc(
      "record_distribution_draft",
      {},
    );
    expect(error).toBeNull();
    expect(data?.[0]?.recorded).toBe(2);

    const { data: movements } = await adminClient
      .from("inventory_movements")
      .select(
        "distribution_acknowledgement_id, ack:distribution_acknowledgements!inventory_movements_distribution_acknowledgement_in_tenant(typed_name, method, recipient_person_id, as_is_text, present_staff)",
      )
      .eq("movement_type", "distributed")
      .in("inventory_item_id", [itemIds[3], itemIds[4]]);
    expect(movements).toHaveLength(2);
    expect(
      new Set(movements!.map((m) => m.distribution_acknowledgement_id)),
    ).toHaveProperty("size", 1);
    expect(movements![0].ack).toMatchObject({
      typed_name: "Robin Example",
      method: "own_device",
      recipient_person_id: recipient,
      as_is_text: AS_IS,
      present_staff: expect.any(String),
    });

    // The item's history shows it on the distribution entry.
    const { data: history } = await adminClient.rpc("inventory_item_history", {
      p_item_id: itemIds[3],
    });
    expect(distributed(history)).toMatchObject({
      as_is_typed_name: "Robin Example",
      as_is_method: "own_device",
    });
  });

  test("a reason is recorded in place of the acknowledgement", async () => {
    await draftWith([itemIds[5]]);
    const { error } = await adminClient.rpc("record_distribution_draft", {
      p_skipped_reason: "other",
      p_skipped_note: "Picked up by a parent",
    });
    expect(error).toBeNull();

    const { data: history } = await adminClient.rpc("inventory_item_history", {
      p_item_id: itemIds[5],
    });
    expect(distributed(history)).toMatchObject({
      as_is_acknowledged_at: null,
      as_is_skipped_reason: "other",
      as_is_skipped_note: "Picked up by a parent",
    });
  });
});

describe("meetup requests", () => {
  /** A meetup request holding `itemId` for `personId`, acknowledged or not. */
  async function hold(itemId: string, personId: string, acknowledged: boolean) {
    const { data: request, error } = await service
      .from("gear_requests")
      .insert({
        person_id: personId,
        delivery_method: "meetup",
        ...(acknowledged
          ? {
              as_is_acknowledged_at: new Date().toISOString(),
              as_is_text: AS_IS,
            }
          : {}),
      })
      .select("id, as_is_method")
      .single();
    if (error) throw error;
    cleanups.push(async () => {
      await service.from("gear_requests").delete().eq("id", request.id);
    });
    const movement = await service.from("inventory_movements").insert({
      inventory_item_id: itemId,
      movement_type: "reserved",
      quantity: 1,
      recipient_person_id: personId,
      gear_request_id: request.id,
    });
    if (movement.error) throw movement.error;
    await service
      .from("inventory_items")
      .update({ status: "reserved" })
      .eq("id", itemId);
    return request;
  }

  test("a handout wholly covered by acknowledged requests skips the step", async () => {
    const recipient = await person();
    const request = await hold(itemIds[6], recipient, true);
    expect(request.as_is_method).toBe("request_form");
    await draftWith([itemIds[6]], recipient);

    const { data } = await adminClient.rpc("distribution_draft_checkout", {});
    expect(data?.[0]?.needs_acknowledgement).toBe(false);
    const { error } = await adminClient.rpc("record_distribution_draft", {});
    expect(error).toBeNull();

    const { data: history } = await adminClient.rpc("inventory_item_history", {
      p_item_id: itemIds[6],
    });
    expect(distributed(history)).toMatchObject({
      as_is_method: "gear_request",
    });
  });

  test("a request from before #1367 is acknowledged in person and written back", async () => {
    const recipient = await person();
    const request = await hold(itemIds[7], recipient, false);
    await draftWith([itemIds[7]], recipient);

    const { data } = await adminClient.rpc("distribution_draft_checkout", {});
    expect(data?.[0]?.needs_acknowledgement).toBe(true);

    const { hash } = await issueToken();
    await acknowledgeByToken(hash);
    const { error } = await adminClient.rpc("record_distribution_draft", {});
    expect(error).toBeNull();

    const { data: after } = await service
      .from("gear_requests")
      .select("as_is_acknowledged_at, as_is_text, as_is_method")
      .eq("id", request.id)
      .single();
    expect(after).toMatchObject({
      as_is_acknowledged_at: expect.any(String),
      as_is_text: AS_IS,
      as_is_method: "in_person",
    });
  });

  test("a piece outside the request still needs the acknowledgement", async () => {
    const recipient = await person();
    await hold(itemIds[8], recipient, true);
    await draftWith([itemIds[8], itemIds[9]], recipient);

    const { data } = await adminClient.rpc("distribution_draft_checkout", {});
    expect(data?.[0]?.needs_acknowledgement).toBe(true);
  });
});
