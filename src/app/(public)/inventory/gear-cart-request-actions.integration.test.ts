// Integration test: exercises the real requestGearItemsAction against a
// real local Supabase stack (request_gear_items RPC, row locking, rate
// limiting). Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  adminClient,
  anonClient,
  createAvailableGearItems,
  getInventoryItemStatus,
  uniqueEmail,
  uniqueIp,
} from "../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentIp: string | null = null;
mock.module("@/lib/get-client-ip", () => ({
  getClientIp: async () => currentIp,
}));

mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => anonClient(),
}));

const { requestGearItemsAction } = await import("./gear-cart-request-actions");

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (cleanups.length) {
    const cleanup = cleanups.pop()!;
    await cleanup();
  }
  revalidatePathMock.mockClear();
});

async function gearItems(count: number) {
  const fixture = await createAvailableGearItems(count);
  cleanups.push(fixture.cleanup);
  return fixture.itemIds;
}

async function giveawayItems(count: number) {
  const fixture = await createAvailableGearItems(count, {
    intendedUse: "giveaway",
  });
  cleanups.push(fixture.cleanup);
  return fixture.itemIds;
}

describe("requestGearItemsAction (integration)", () => {
  test("reserves every item in the cart for one requester", async () => {
    currentIp = uniqueIp();
    const [first, second, third] = await gearItems(3);
    const email = uniqueEmail("happy-path");

    const result = await requestGearItemsAction(
      [first, second, third],
      formData({ name: "Jamie Rivera", email }),
    );

    expect(result).toEqual({ success: true });
    expect(await getInventoryItemStatus(first)).toBe("reserved");
    expect(await getInventoryItemStatus(second)).toBe("reserved");
    expect(await getInventoryItemStatus(third)).toBe("reserved");
    expect(revalidatePathMock).toHaveBeenCalledWith("/inventory/library");
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/inventory/items");
  });

  // Giveaway prize stock (sponsor vouchers and the like) is never listed in
  // the public catalog, so reaching the RPC with one means a hand-crafted
  // request -- it must be refused rather than reserved.
  test("refuses an item that is not gear-library stock", async () => {
    currentIp = uniqueIp();
    const [gearItem] = await gearItems(1);
    const [giveawayItem] = await giveawayItems(1);

    const result = await requestGearItemsAction(
      [gearItem, giveawayItem],
      formData({ name: "Jamie Rivera", email: uniqueEmail("giveaway") }),
    );

    expect(result).toEqual({
      error: "One of the items in your cart could not be found.",
    });
    expect(await getInventoryItemStatus(gearItem)).toBe("available");
    expect(await getInventoryItemStatus(giveawayItem)).toBe("available");
  });

  test("keeps items that are not gear-library stock out of the public catalog", async () => {
    const [giveawayItem] = await giveawayItems(1);

    const { data } = await anonClient()
      .from("public_gear_catalog")
      .select("id")
      .eq("id", giveawayItem)
      .maybeSingle();

    expect(data).toBeNull();
  });

  test("fails the whole request, leaving other items untouched, when one item is already taken", async () => {
    currentIp = uniqueIp();
    const [available, alreadyTaken] = await gearItems(2);

    const firstTaker = await requestGearItemsAction(
      [alreadyTaken],
      formData({ name: "First Taker", email: uniqueEmail("first-taker") }),
    );
    expect(firstTaker).toEqual({ success: true });

    const result = await requestGearItemsAction(
      [available, alreadyTaken],
      formData({ name: "Jamie Rivera", email: uniqueEmail("blocked") }),
    );

    expect(result).toEqual({
      error:
        "Sorry, one of the items in your cart was just requested by someone else. Remove it and try again.",
    });
    expect(await getInventoryItemStatus(available)).toBe("available");
    expect(await getInventoryItemStatus(alreadyTaken)).toBe("reserved");
  });

  // #721: the request text belongs to the request, not to the requester's
  // directory record -- where it survived retention and could overwrite what
  // staff had written about a returning person.
  test("stores the request notes on the movements, not on the person", async () => {
    currentIp = uniqueIp();
    const [first, second] = await gearItems(2);
    const email = uniqueEmail("notes");
    const notes = "Size 10 boots if you have them; otherwise a 9.5 works.";

    const result = await requestGearItemsAction(
      [first, second],
      formData({ name: "Jamie Rivera", email, notes }),
    );
    expect(result).toEqual({ success: true });

    const { data: movements } = await adminClient
      .from("inventory_movements")
      .select("notes, recipient_person_id")
      .in("inventory_item_id", [first, second])
      .eq("movement_type", "reserved");

    expect(movements).toHaveLength(2);
    for (const movement of movements ?? []) {
      expect(movement.notes).toBe(notes);
    }

    const { data: person } = await adminClient
      .from("people")
      .select("notes")
      .eq("id", movements![0].recipient_person_id)
      .single();

    expect(person!.notes).toBeNull();
  });

  test("reports an error for an empty cart", async () => {
    currentIp = uniqueIp();

    const result = await requestGearItemsAction(
      [],
      formData({ name: "Jamie Rivera", email: uniqueEmail("empty-cart") }),
    );

    expect(result).toEqual({
      error: "Add at least one item to your cart before submitting.",
    });
  });

  test("reports ITEM_NOT_FOUND for a bogus item id", async () => {
    currentIp = uniqueIp();
    const [available] = await gearItems(1);

    const result = await requestGearItemsAction(
      [available, "00000000-0000-0000-0000-000000000000"],
      formData({ name: "Jamie Rivera", email: uniqueEmail("not-found") }),
    );

    expect(result).toEqual({
      error: "One of the items in your cart could not be found.",
    });
    expect(await getInventoryItemStatus(available)).toBe("available");
  });

  test("silently no-ops when the honeypot field is filled", async () => {
    currentIp = uniqueIp();
    const [item] = await gearItems(1);
    const email = uniqueEmail("honeypot");

    const result = await requestGearItemsAction(
      [item],
      formData({ name: "A Bot", email, company: "Definitely A Company" }),
    );

    // The RPC reports fake success to avoid tipping off bots, but no row is
    // actually mutated -- only a DB check can catch a regression here.
    expect(result).toEqual({ success: true });
    expect(await getInventoryItemStatus(item)).toBe("available");
  });

  test("rate-limits repeated requests from the same IP", async () => {
    currentIp = uniqueIp();
    const items = await gearItems(9);

    for (let i = 0; i < 8; i++) {
      const result = await requestGearItemsAction(
        [items[i]],
        formData({ name: "Repeat Requester", email: uniqueEmail(`rate-${i}`) }),
      );
      expect(result).toEqual({ success: true });
    }

    const limited = await requestGearItemsAction(
      [items[8]],
      formData({ name: "Repeat Requester", email: uniqueEmail("rate-9") }),
    );
    expect(limited).toEqual({
      error: "Too many attempts — please try again in a few minutes.",
    });
    expect(await getInventoryItemStatus(items[8])).toBe("available");
  });
});

// #748. The "already taken" case above is sequential -- the first request has
// committed before the second starts, so the RPC's status read sees it. The
// case that actually double-books an item is two carts checking availability
// before either has reserved, which only overlapping promises produce.
describe("requestGearItemsAction under concurrency", () => {
  // The requester `people` rows resolve_or_create_person_by_email() minted.
  // Registered before the gear fixture so it pops last: cleanupDonation()
  // clears the movements that reference them first.
  function cleanUpRequesters(emails: string[]) {
    cleanups.push(async () => {
      await adminClient.from("people").delete().in("email", emails);
    });
  }

  async function reservedMovements(itemIds: string[]) {
    const { data, error } = await adminClient
      .from("inventory_movements")
      .select("inventory_item_id, recipient_person_id")
      .in("inventory_item_id", itemIds)
      .eq("movement_type", "reserved");
    if (error) throw error;
    return data;
  }

  test("hands one item to exactly one of two simultaneous requesters", async () => {
    currentIp = uniqueIp();
    const emails = [uniqueEmail("race-a"), uniqueEmail("race-b")];
    cleanUpRequesters(emails);
    const [item] = await gearItems(1);

    const results = await Promise.all(
      emails.map((email, i) =>
        requestGearItemsAction([item], formData({ name: `Racer ${i}`, email })),
      ),
    );

    expect(results.filter((result) => "success" in result)).toHaveLength(1);
    expect(results.filter((result) => "error" in result)).toEqual([
      {
        error:
          "Sorry, one of the items in your cart was just requested by someone else. Remove it and try again.",
      },
    ]);

    // One reservation, to one person -- not two rows, and not a second row
    // silently overwriting the first requester.
    const movements = await reservedMovements([item]);
    expect(movements).toHaveLength(1);
    expect(await getInventoryItemStatus(item)).toBe("reserved");
  });

  // Two carts that overlap on one item but not the other. Whoever loses the
  // contested item must lose their whole cart: a half-filled request would
  // strand the uncontested item as reserved for someone who was told no.
  test("keeps overlapping carts all-or-nothing, in either lock order", async () => {
    currentIp = uniqueIp();
    const emails = [uniqueEmail("cart-a"), uniqueEmail("cart-b")];
    cleanUpRequesters(emails);
    const [onlyA, contested, onlyB] = await gearItems(3);

    // Reversed item order between the two carts: request_gear_items locks its
    // pre-check pass in sorted order precisely so this cannot deadlock.
    const [first, second] = await Promise.all([
      requestGearItemsAction(
        [onlyA, contested],
        formData({ name: "Cart A", email: emails[0] }),
      ),
      requestGearItemsAction(
        [contested, onlyB],
        formData({ name: "Cart B", email: emails[1] }),
      ),
    ]);

    const winnerIsA = "success" in first;
    expect(winnerIsA ? second : first).toEqual({
      error:
        "Sorry, one of the items in your cart was just requested by someone else. Remove it and try again.",
    });
    expect(winnerIsA ? first : second).toEqual({ success: true });

    expect(await getInventoryItemStatus(contested)).toBe("reserved");
    expect(await getInventoryItemStatus(winnerIsA ? onlyA : onlyB)).toBe(
      "reserved",
    );
    // The loser's uncontested item stays free for the next visitor.
    expect(await getInventoryItemStatus(winnerIsA ? onlyB : onlyA)).toBe(
      "available",
    );

    const movements = await reservedMovements([onlyA, contested, onlyB]);
    expect(movements).toHaveLength(2);
    expect(new Set(movements.map((m) => m.recipient_person_id)).size).toBe(1);
  });
});
