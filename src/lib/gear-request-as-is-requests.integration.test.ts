// Integration test for asking a gear requester to acknowledge as-is by
// emailed link (#1518), against the real RPCs on a local Supabase stack: the
// staff ask, the shared /acknowledge pair answering for a request's link, and
// every way a link dies -- used, superseded, expired, cancelled, acknowledged
// meanwhile, another tenant's. Requires `bun run db:start && bun run db:reset`;
// run via `bun run test:integration`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mintConfirmationToken } from "@/lib/notifications/notification-email-token";
import {
  adminClient,
  anonClient,
  createAvailableGearItems,
  createPerson,
  serviceRoleClient,
  signInAs,
  SEEDED_USERS,
  uniqueIp,
} from "../../test/integration-setup";

const service = serviceRoleClient();
const anon = anonClient();
const AS_IS = "We give away everything as-is.";
const run = Date.now();

let cleanupItems: () => Promise<void>;
const cleanups: (() => Promise<void>)[] = [];
let itemIds: string[];
let nextItem = 0;

beforeAll(async () => {
  const items = await createAvailableGearItems(14);
  itemIds = items.itemIds;
  cleanupItems = items.cleanup;
});

afterAll(async () => {
  await cleanupItems?.();
  while (cleanups.length) await cleanups.pop()!();
});

/** A request from before #1367 -- no acknowledgement -- holding one item. */
async function legacyRequest(
  overrides: { acknowledged?: boolean; status?: "cancelled" } = {},
) {
  const person = await createPerson({ name: "Robin Example" });
  cleanups.push(person.cleanup);
  const { data: request, error } = await service
    .from("gear_requests")
    .insert({
      person_id: person.id,
      delivery_method: "meetup",
      ...(overrides.acknowledged
        ? {
            as_is_acknowledged_at: new Date().toISOString(),
            as_is_text: AS_IS,
          }
        : {}),
      ...(overrides.status === "cancelled"
        ? { status: "cancelled", cancelled_at: new Date().toISOString() }
        : {}),
    })
    .select("id")
    .single();
  if (error) throw error;
  cleanups.push(async () => {
    await service
      .from("inventory_movements")
      .delete()
      .eq("gear_request_id", request.id);
    await service.from("gear_requests").delete().eq("id", request.id);
  });
  const movement = await service.from("inventory_movements").insert({
    inventory_item_id: itemIds[nextItem++],
    movement_type: "reserved",
    quantity: 1,
    recipient_person_id: person.id,
    gear_request_id: request.id,
  });
  if (movement.error) throw movement.error;
  return { id: request.id as string, personId: person.id };
}

async function ask(requestId: string) {
  const { token, hash } = mintConfirmationToken();
  const { data, error } = await adminClient.rpc(
    "request_gear_request_acknowledgements",
    { p_requests: [{ request_id: requestId, token_hash: hash }] },
  );
  if (error) throw error;
  return { token, hash, written: (data ?? []) as { request_id: string }[] };
}

function view(hash: string, client = anon) {
  return client.rpc("get_as_is_acknowledgement", {
    p_token_hash: hash,
    p_ip_address: uniqueIp(),
  });
}

function acknowledge(
  hash: string,
  overrides: { acknowledged?: boolean; name?: string } = {},
  client = anon,
) {
  return client.rpc("acknowledge_as_is_by_token", {
    p_token_hash: hash,
    p_acknowledged: overrides.acknowledged ?? true,
    p_typed_name: overrides.name ?? "Robin Example",
    p_as_is_text: AS_IS,
    p_ip_address: uniqueIp(),
  });
}

async function requestRow(id: string) {
  const { data, error } = await service
    .from("gear_requests")
    .select("as_is_acknowledged_at, as_is_text, as_is_method, as_is_typed_name")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

async function expectDead(hash: string, client = anon) {
  const { error } = await view(hash, client);
  expect(error?.message).toBe("LINK_INVALID");
  const ack = await acknowledge(hash, {}, client);
  expect(ack.error?.message).toBe("LINK_INVALID");
}

describe("asking", () => {
  test("only inventory:manage may ask", async () => {
    const request = await legacyRequest();
    const viewer = await signInAs(SEEDED_USERS.volunteer);
    const { hash } = mintConfirmationToken();
    const { error } = await viewer.rpc(
      "request_gear_request_acknowledgements",
      {
        p_requests: [{ request_id: request.id, token_hash: hash }],
      },
    );
    expect(error?.message).toBe("PERMISSION_DENIED");
  });

  test("cancelled and already-acknowledged requests are skipped", async () => {
    const cancelled = await legacyRequest({ status: "cancelled" });
    const done = await legacyRequest({ acknowledged: true });
    expect((await ask(cancelled.id)).written).toEqual([]);
    expect((await ask(done.id)).written).toEqual([]);
  });

  test("the token hash is not readable by staff", async () => {
    const request = await legacyRequest();
    await ask(request.id);
    const { error } = await adminClient
      .from("gear_request_acknowledgement_requests")
      .select("token_hash")
      .eq("request_id", request.id);
    expect(error).not.toBeNull();
    const { data } = await adminClient
      .from("gear_request_acknowledgement_requests")
      .select("requested_at, acknowledged_at")
      .eq("request_id", request.id)
      .single();
    expect(data?.requested_at).toBeTruthy();
    expect(data?.acknowledged_at).toBeNull();
  });
});

describe("following the link", () => {
  test("shows the first name and the items, and records the acknowledgement", async () => {
    const request = await legacyRequest();
    const { hash } = await ask(request.id);

    const { data, error } = await view(hash);
    expect(error).toBeNull();
    expect(data).toMatchObject({ kind: "gear_request", first_name: "Robin" });
    expect((data as { items: unknown[] }).items).toHaveLength(1);

    const refused = await acknowledge(hash, { acknowledged: false });
    expect(refused.error?.message).toBe("AS_IS_REQUIRED");
    const unnamed = await acknowledge(hash, { name: "  " });
    expect(unnamed.error?.message).toBe("NAME_REQUIRED");

    const ok = await acknowledge(hash, { name: "Robin Example" });
    expect(ok.error).toBeNull();
    expect(ok.data).toBe("gear_request");
    expect(await requestRow(request.id)).toMatchObject({
      as_is_text: AS_IS,
      as_is_method: "emailed_link",
      as_is_typed_name: "Robin Example",
    });

    const { data: link } = await adminClient
      .from("gear_request_acknowledgement_requests")
      .select("acknowledged_at")
      .eq("request_id", request.id)
      .single();
    expect(link?.acknowledged_at).toBeTruthy();

    // One use.
    await expectDead(hash);
  });

  test("asking again supersedes the earlier link", async () => {
    const request = await legacyRequest();
    const first = await ask(request.id);
    const second = await ask(request.id);
    await expectDead(first.hash);
    expect((await view(second.hash)).error).toBeNull();
  });

  test("an expired link is dead", async () => {
    const request = await legacyRequest();
    const { hash } = await ask(request.id);
    await service
      .from("gear_request_acknowledgement_requests")
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("request_id", request.id);
    await expectDead(hash);
  });

  test("a request cancelled after the ask is dead", async () => {
    const request = await legacyRequest();
    const { hash } = await ask(request.id);
    const { error } = await adminClient.rpc("set_gear_request_status", {
      p_request_id: request.id,
      p_status: "cancelled",
      p_quoted_amount: null,
    });
    expect(error).toBeNull();
    await expectDead(hash);
  });

  test("a request acknowledged meanwhile is dead, and keeps its first record", async () => {
    const request = await legacyRequest();
    const { hash } = await ask(request.id);
    await service
      .from("gear_requests")
      .update({
        as_is_acknowledged_at: new Date().toISOString(),
        as_is_text: AS_IS,
        as_is_method: "in_person",
      })
      .eq("id", request.id);
    await expectDead(hash);
    expect((await requestRow(request.id)).as_is_method).toBe("in_person");
  });

  test("another tenant's site does not honour the link", async () => {
    const request = await legacyRequest();
    const { hash } = await ask(request.id);
    await expectDead(hash, anonClient({ slug: `no-such-tenant-${run}` }));
    // Still live on its own site: the refusal was the tenant's.
    expect((await view(hash)).error).toBeNull();
  });
});

describe("retention", () => {
  test("the typed name goes with the requester link; the record stays", async () => {
    const request = await legacyRequest();
    const { hash } = await ask(request.id);
    expect((await acknowledge(hash)).error).toBeNull();

    await service
      .from("gear_requests")
      .update({ person_id: null })
      .eq("id", request.id);
    const row = await requestRow(request.id);
    expect(row.as_is_typed_name).toBeNull();
    expect(row.as_is_method).toBe("emailed_link");
    expect(row.as_is_acknowledged_at).toBeTruthy();
  });
});
