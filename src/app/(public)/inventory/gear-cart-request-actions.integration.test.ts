// Integration test: exercises the real requestGearItemsAction against a
// real local Supabase stack (request_gear_items RPC, row locking, rate
// limiting). Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import {
  adminClient,
  anonClient,
  createAvailableGearItems,
  getInventoryItemStatus,
  serviceRoleClient,
  uniqueEmail,
  uniqueIp,
} from "../../../../test/integration-setup";
import {
  PAYMENT_METHODS_SETTING_KEY,
  SHIPPING_ENABLED_SETTING_KEY,
} from "@/lib/gear-requests";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentIp: string | null = null;
mock.module("@/lib/get-client-ip", () => ({
  getClientIp: async () => currentIp,
}));

mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => anonClient(),
}));

// The action schedules its two sends with after() (#1032). This file imports
// the action directly, so there is no request scope and Next's real after()
// would throw -- and the notifier it schedules imports "server-only", which
// throws outside Next's bundler. Everything else in next/server is kept, so
// the mock cannot surprise another file sharing this process. Same shape as
// contact-actions.integration.test.ts.
mock.module("server-only", () => ({}));
const nextServer = await import("next/server");
const afterTasks: Promise<unknown>[] = [];
mock.module("next/server", () => ({
  ...nextServer,
  after: (task: () => Promise<unknown>) => {
    afterTasks.push(task());
  },
}));

const { requestGearItemsAction } = await import("./gear-cart-request-actions");

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  // Let the scheduled sends settle before the fixtures they read go away.
  // RESEND_API_KEY is unset here, so nothing leaves the building; the
  // requester's confirmation row cascades away with their people row.
  await Promise.all(afterTasks.splice(0));
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
  // staff had written about a returning person. #1032 moved it one step
  // further, from every movement onto the one request header.
  test("records one request header for the cart, with the notes on it", async () => {
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
      .select("notes, recipient_person_id, gear_request_id")
      .in("inventory_item_id", [first, second])
      .eq("movement_type", "reserved");

    expect(movements).toHaveLength(2);
    const requestIds = new Set(movements!.map((m) => m.gear_request_id));
    expect(requestIds.size).toBe(1);
    for (const movement of movements ?? []) {
      expect(movement.notes).toBeNull();
    }

    const { data: request } = await adminClient
      .from("gear_requests")
      .select("status, delivery_method, notes, person_id, payment_method")
      .eq("id", movements![0].gear_request_id)
      .single();
    expect(request).toEqual({
      status: "new",
      delivery_method: "meetup",
      notes,
      person_id: movements![0].recipient_person_id,
      payment_method: null,
    });

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

// #1032. Shipping is the tenant's to offer: the form, the action's parser and
// the RPC all read the same two settings, and the RPC is the one that counts.
describe("requestGearItemsAction with shipping", () => {
  const service = serviceRoleClient();
  let tenantId: string;

  const shippingFields = {
    delivery_method: "shipping",
    ship_name: "Jamie Rivera",
    ship_line1: "12 Ridge Rd",
    ship_line2: "Unit 4",
    ship_city: "Bend",
    ship_region: "OR",
    ship_postal_code: "97701",
    ship_country: "USA",
    payment_method: "venmo",
  };

  async function offerShipping(enabled: boolean) {
    const { error } = await service.from("app_settings").upsert(
      [
        {
          tenant_id: tenantId,
          key: SHIPPING_ENABLED_SETTING_KEY,
          value: enabled,
        },
        {
          tenant_id: tenantId,
          key: PAYMENT_METHODS_SETTING_KEY,
          value: [
            { key: "zelle", label: "Zelle", handle: "", instructions: "" },
            { key: "venmo", label: "Venmo", handle: "@it", instructions: "" },
          ],
        },
      ],
      { onConflict: "tenant_id,key" },
    );
    if (error) throw error;
  }

  beforeAll(async () => {
    // The tenant the anon client resolves to: the seeded first one.
    const { data, error } = await service
      .from("tenants")
      .select("id")
      .order("created_at")
      .limit(1)
      .single();
    if (error) throw error;
    tenantId = data.id as string;
  });

  afterEach(async () => {
    await service
      .from("app_settings")
      .delete()
      .eq("tenant_id", tenantId)
      .in("key", [SHIPPING_ENABLED_SETTING_KEY, PAYMENT_METHODS_SETTING_KEY]);
  });

  test("records the address and the postage payment choice on the request", async () => {
    await offerShipping(true);
    currentIp = uniqueIp();
    const [item] = await gearItems(1);

    const result = await requestGearItemsAction(
      [item],
      formData({
        name: "Jamie Rivera",
        email: uniqueEmail("shipping"),
        ...shippingFields,
      }),
    );
    expect(result).toEqual({ success: true });

    const { data: movement } = await adminClient
      .from("inventory_movements")
      .select(
        "gear_request:gear_requests(delivery_method, ship_name, ship_line1, ship_line2, ship_city, ship_region, ship_postal_code, ship_country, payment_method, status)",
      )
      .eq("inventory_item_id", item)
      .eq("movement_type", "reserved")
      .single();
    // supabase-js types a to-one embed through a composite key as an array;
    // PostgREST answers with the one object.
    expect(movement!.gear_request as unknown).toEqual({
      delivery_method: "shipping",
      ship_name: "Jamie Rivera",
      ship_line1: "12 Ridge Rd",
      ship_line2: "Unit 4",
      ship_city: "Bend",
      ship_region: "OR",
      ship_postal_code: "97701",
      ship_country: "USA",
      payment_method: "venmo",
      status: "new",
    });
  });

  test("refuses shipping the tenant has not turned on, and reserves nothing", async () => {
    await offerShipping(false);
    currentIp = uniqueIp();
    const [item] = await gearItems(1);

    const result = await requestGearItemsAction(
      [item],
      formData({
        name: "Jamie Rivera",
        email: uniqueEmail("no-shipping"),
        ...shippingFields,
      }),
    );
    expect(result).toEqual({
      error: "Shipping isn't available right now. Choose a meetup instead.",
    });
    expect(await getInventoryItemStatus(item)).toBe("available");
  });

  // The RPC's own check, bypassing the action's parser: an address the form
  // would have refused must be refused again underneath it.
  test("the RPC refuses a shipping request with no address", async () => {
    await offerShipping(true);
    const [item] = await gearItems(1);

    const { error } = await anonClient().rpc("request_gear_items", {
      p_inventory_item_ids: [item],
      p_name: "Jamie Rivera",
      p_email: uniqueEmail("rpc-no-address"),
      p_phone: null,
      p_ip_address: uniqueIp(),
      p_delivery_method: "shipping",
      p_shipping: { name: "Jamie" },
      p_payment_method: "venmo",
    });
    expect(error?.message).toContain("SHIPPING_ADDRESS_REQUIRED");
    expect(await getInventoryItemStatus(item)).toBe("available");
  });

  test("the RPC refuses a payment method the tenant does not accept", async () => {
    await offerShipping(true);
    const [item] = await gearItems(1);

    const { error } = await anonClient().rpc("request_gear_items", {
      p_inventory_item_ids: [item],
      p_name: "Jamie Rivera",
      p_email: uniqueEmail("rpc-bad-method"),
      p_phone: null,
      p_ip_address: uniqueIp(),
      p_delivery_method: "shipping",
      p_shipping: { line1: "12 Ridge Rd", city: "Bend", postal_code: "97701" },
      p_payment_method: "cash",
    });
    expect(error?.message).toContain("PAYMENT_METHOD_INVALID");
    expect(await getInventoryItemStatus(item)).toBe("available");
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
