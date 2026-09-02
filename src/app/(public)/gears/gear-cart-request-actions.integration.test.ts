// Integration test: exercises the real requestGearItemsAction against a
// real local Supabase stack (request_gear_items RPC, row locking, rate
// limiting). Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import {
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
    expect(revalidatePathMock).toHaveBeenCalledWith("/gears/library");
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/inventory/items");
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
