// Integration coverage for staff edits to an open gear request (#1527): adding
// an item, removing one, and editing the notes -- the RPCs' refusals, the
// sentences the actions answer with, and that a removed item no longer reads
// as part of the request anywhere that keys on its `reserved` movements --
// including fulfilment, which distributes only what the request still holds --
// and returning an item from a fulfilled request to the shelf (#1567).
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  anonClient,
  createAvailableGearItems,
  seededTenantId,
  serviceRoleClient,
  signIn,
  signInAs,
  uniqueEmail,
  uniqueIp,
  withModule,
} from "../../../../../../test/integration-setup";

mock.module("next/cache", () => ({ revalidatePath: mock(() => {}) }));
mock.module("server-only", () => ({}));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  addGearRequestItemAction,
  removeGearRequestItemAction,
  returnGearRequestItemAction,
  setGearRequestNotesAction,
  setGearRequestStatusAction,
} = await import("./actions");

const service = serviceRoleClient();
const cleanups: (() => Promise<void>)[] = [];
const requesterEmails: string[] = [];

afterAll(async () => {
  for (const cleanup of cleanups) await cleanup();
  if (requesterEmails.length) {
    await service.from("people").delete().in("email", requesterEmails);
  }
});

async function availableItems(count: number): Promise<string[]> {
  const fixture = await createAvailableGearItems(count);
  cleanups.unshift(fixture.cleanup);
  return fixture.itemIds;
}

/** A real public gear request holding `count` items. */
async function newGearRequest(
  count: number,
): Promise<{ id: string; itemIds: string[] }> {
  const itemIds = await availableItems(count);
  const email = uniqueEmail("gear-edit");
  requesterEmails.push(email);
  const { data, error } = await anonClient().rpc("request_gear_items", {
    p_inventory_item_ids: itemIds,
    p_name: "Integration Test Requester",
    p_email: email,
    p_phone: null,
    p_notes: "Original note",
    p_honeypot: null,
    p_ip_address: uniqueIp(),
    p_as_is_acknowledged: true,
    p_as_is_text: "Given as-is.",
  });
  if (error) throw error;
  return { id: data as string, itemIds };
}

async function itemStatus(id: string): Promise<string> {
  const { data, error } = await service
    .from("inventory_items")
    .select("status")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data.status as string;
}

/** The items the request's `reserved` movements name -- what every reader uses. */
async function requestItemIds(requestId: string): Promise<string[]> {
  const { data, error } = await service
    .from("inventory_movements")
    .select("inventory_item_id")
    .eq("gear_request_id", requestId)
    .eq("movement_type", "reserved");
  if (error) throw error;
  return data.map((row) => row.inventory_item_id as string).sort();
}

describe("gear request item edits", () => {
  test("a volunteer is refused every edit", async () => {
    const request = await newGearRequest(2);
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);
    const denied = {
      error: "You don't have permission to perform this action.",
    };
    expect(
      await removeGearRequestItemAction(request.id, request.itemIds[0]),
    ).toEqual(denied);
    expect(await setGearRequestNotesAction(request.id, "x")).toEqual(denied);
    const [extra] = await availableItems(1);
    expect(await addGearRequestItemAction(request.id, extra)).toEqual(denied);
  });

  test("adding an available item reserves it under the request", async () => {
    const request = await newGearRequest(1);
    const [extra] = await availableItems(1);
    currentSupabase = await signIn(SEEDED_USERS.admin);

    expect(await addGearRequestItemAction(request.id, extra)).toEqual({
      success: true,
    });
    expect(await itemStatus(extra)).toBe("reserved");
    expect(await requestItemIds(request.id)).toEqual(
      [...request.itemIds, extra].sort(),
    );

    // Already held now, so a second add is refused.
    expect(await addGearRequestItemAction(request.id, extra)).toEqual({
      error: "That item is no longer available.",
    });
  });

  test("an item outside the gear library cannot be added", async () => {
    const request = await newGearRequest(1);
    const fixture = await createAvailableGearItems(1, {
      intendedUse: "giveaway",
    });
    cleanups.unshift(fixture.cleanup);
    currentSupabase = await signIn(SEEDED_USERS.admin);

    expect(
      await addGearRequestItemAction(request.id, fixture.itemIds[0]),
    ).toEqual({ error: "That item could not be found in the public catalog." });
  });

  test("removing an item releases it and takes it off the request", async () => {
    const request = await newGearRequest(2);
    const [removed, kept] = request.itemIds;
    currentSupabase = await signIn(SEEDED_USERS.admin);

    expect(await removeGearRequestItemAction(request.id, removed)).toEqual({
      success: true,
    });
    expect(await itemStatus(removed)).toBe("available");
    expect(await requestItemIds(request.id)).toEqual([kept]);

    // The release is on the item's record, linked to the request it left.
    const { data: release } = await service
      .from("inventory_movements")
      .select("movement_type, reason")
      .eq("gear_request_id", request.id)
      .eq("inventory_item_id", removed)
      .single();
    expect(release).toEqual({
      movement_type: "other",
      reason: "Removed from gear request",
    });

    // Not held any more, so a second removal is refused.
    expect(await removeGearRequestItemAction(request.id, removed)).toEqual({
      error: "This request is not holding that item.",
    });
  });

  test("the last item cannot be removed", async () => {
    const request = await newGearRequest(1);
    currentSupabase = await signIn(SEEDED_USERS.admin);
    expect(
      await removeGearRequestItemAction(request.id, request.itemIds[0]),
    ).toEqual({
      error:
        "This is the last item on the request. Cancel the request instead.",
    });
    expect(await itemStatus(request.itemIds[0])).toBe("reserved");
  });

  test("cancelling after a removal leaves another request's hold alone", async () => {
    const first = await newGearRequest(2);
    const [removed] = first.itemIds;
    currentSupabase = await signIn(SEEDED_USERS.admin);
    await removeGearRequestItemAction(first.id, removed);

    // Someone else requests the removed item.
    const email = uniqueEmail("gear-edit-second");
    requesterEmails.push(email);
    const { error } = await anonClient().rpc("request_gear_items", {
      p_inventory_item_ids: [removed],
      p_name: "Second Requester",
      p_email: email,
      p_phone: null,
      p_notes: null,
      p_honeypot: null,
      p_ip_address: uniqueIp(),
      p_as_is_acknowledged: true,
      p_as_is_text: "Given as-is.",
    });
    if (error) throw error;

    expect(await setGearRequestStatusAction(first.id, "cancelled")).toEqual({
      success: true,
    });
    expect(await itemStatus(removed)).toBe("reserved");
  });

  test("fulfilling hands over what the request still holds, and nothing else", async () => {
    const request = await newGearRequest(2);
    const [removed, kept] = request.itemIds;
    currentSupabase = await signIn(SEEDED_USERS.admin);
    await removeGearRequestItemAction(request.id, removed);

    expect(await setGearRequestStatusAction(request.id, "fulfilled")).toEqual({
      success: true,
    });
    expect(await itemStatus(kept)).toBe("distributed");
    expect(await itemStatus(removed)).toBe("available");

    const { data: requester } = await service
      .from("gear_requests")
      .select("person_id")
      .eq("id", request.id)
      .single();
    const { data: handover } = await service
      .from("inventory_movements")
      .select("inventory_item_id, recipient_person_id")
      .eq("gear_request_id", request.id)
      .eq("movement_type", "distributed");
    expect(handover).toEqual([
      { inventory_item_id: kept, recipient_person_id: requester?.person_id },
    ]);
  });

  test("notes are trimmed, blank clears them, and a closed request refuses", async () => {
    const request = await newGearRequest(1);
    currentSupabase = await signIn(SEEDED_USERS.admin);

    expect(await setGearRequestNotesAction(request.id, "  New note  ")).toEqual(
      { success: true },
    );
    const notes = async () =>
      (
        await service
          .from("gear_requests")
          .select("notes")
          .eq("id", request.id)
          .single()
      ).data?.notes;
    expect(await notes()).toBe("New note");

    await setGearRequestNotesAction(request.id, "   ");
    expect(await notes()).toBeNull();

    await setGearRequestStatusAction(request.id, "cancelled");
    expect(await setGearRequestNotesAction(request.id, "Late")).toEqual({
      error: "This request is already fulfilled or cancelled.",
    });
  });

  test("a fulfilled item that was not handed over goes back on the shelf", async () => {
    const request = await newGearRequest(2);
    const [returned, kept] = request.itemIds;
    currentSupabase = await signIn(SEEDED_USERS.admin);

    // Not while the request is open: removal is the edit for that.
    expect(await returnGearRequestItemAction(request.id, returned)).toEqual({
      error: "Only a fulfilled request can have items returned.",
    });

    await setGearRequestStatusAction(request.id, "fulfilled");
    expect(await returnGearRequestItemAction(request.id, returned)).toEqual({
      success: true,
    });
    expect(await itemStatus(returned)).toBe("available");
    expect(await itemStatus(kept)).toBe("distributed");

    const { data: header } = await service
      .from("gear_requests")
      .select("status")
      .eq("id", request.id)
      .single();
    expect(header?.status).toBe("fulfilled");

    const { data: movement } = await service
      .from("inventory_movements")
      .select("reason")
      .eq("gear_request_id", request.id)
      .eq("inventory_item_id", returned)
      .eq("movement_type", "other")
      .single();
    expect(movement?.reason).toBe("Returned after gear request fulfilled");

    // Already back, so a second return is refused.
    expect(await returnGearRequestItemAction(request.id, returned)).toEqual({
      error:
        "That item was not handed over on this request, or has moved on since.",
    });
  });

  test("an item that moved on after the handover is not the request's to return", async () => {
    const request = await newGearRequest(1);
    const [item] = request.itemIds;
    currentSupabase = await signIn(SEEDED_USERS.admin);
    await setGearRequestStatusAction(request.id, "fulfilled");

    // Something recorded against the item since -- here a correction.
    const { data: tenant } = await service
      .from("inventory_items")
      .select("tenant_id")
      .eq("id", item)
      .single();
    const { error } = await service.from("inventory_movements").insert({
      tenant_id: tenant?.tenant_id,
      inventory_item_id: item,
      movement_type: "corrected",
      quantity: 1,
      reason: "Later correction",
    });
    if (error) throw error;

    expect(await returnGearRequestItemAction(request.id, item)).toEqual({
      error:
        "That item was not handed over on this request, or has moved on since.",
    });
    expect(await itemStatus(item)).toBe("distributed");
  });

  test("the requester stops seeing a returned item as received", async () => {
    const request = await newGearRequest(2);
    const [returned, kept] = request.itemIds;
    currentSupabase = await signIn(SEEDED_USERS.admin);
    await setGearRequestStatusAction(request.id, "fulfilled");
    await returnGearRequestItemAction(request.id, returned);

    // Give the requester an account, as an approved claim would.
    const { data: header } = await service
      .from("gear_requests")
      .select("person:people(id, email)")
      .eq("id", request.id)
      .single();
    const person = header?.person as unknown as { id: string; email: string };
    const { data: user, error: userError } =
      await service.auth.admin.createUser({
        email: person.email,
        password: "password123",
        email_confirm: true,
      });
    if (userError) throw userError;
    cleanups.unshift(async () => {
      await service
        .from("people")
        .update({ auth_user_id: null })
        .eq("id", person.id);
      await service.auth.admin.deleteUser(user.user!.id);
    });
    await service
      .from("people")
      .update({ auth_user_id: user.user!.id })
      .eq("id", person.id);
    const requester = await signIn(person.email);

    const descriptions = async (id: string) =>
      (
        await service
          .from("inventory_items")
          .select("description")
          .eq("id", id)
          .single()
      ).data?.description as string;

    await withModule(
      await seededTenantId(),
      "constituent_accounts",
      true,
      async () => {
        const { data, error } = await requester.rpc("my_gear_history");
        if (error) throw error;
        const received = (data ?? [])
          .filter((row: { kind: string }) => row.kind === "received")
          .flatMap((row: { items: string[] }) => row.items);
        expect(received).toEqual([await descriptions(kept)]);
      },
    );
  });
});
