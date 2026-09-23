// Integration test (#1420 part 3): the scanned-distribution draft's RLS, the
// add/record RPCs, and the /portal/t/[code] resolver's "add to the
// distribution" offer, against a real local Supabase stack. Requires
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
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  createAvailableGearItems,
  createPublishedEvent,
  getInventoryItemStatus,
  signInAs,
  SEEDED_USERS,
  unprivilegedActors,
} from "../../test/integration-setup";

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
}));

const { getDistributionDraft, getCurrentDistributionDraft } =
  await import("./inventory-distribution-draft");
const { default: InventoryTagPage } =
  await import("@/app/portal/(app)/t/[code]/page");
const { addTagToCurrentDistributionAction } =
  await import("@/app/portal/(app)/t/[code]/actions");

async function resolve(code: string, as: SupabaseClient) {
  currentSupabase = as;
  try {
    await InventoryTagPage({
      params: Promise.resolve({ code }),
      searchParams: Promise.resolve({}),
    });
    return { rendered: true };
  } catch (error) {
    if (error instanceof Redirect) return { redirect: error.url };
    if (error instanceof NotFound) return { notFound: true };
    throw error;
  }
}

async function assetTag(itemId: string) {
  const { data, error } = await adminClient
    .from("inventory_item_tags")
    .insert({ item_id: itemId, kind: "asset_tag", value: "" })
    .select("value")
    .single();
  if (error) throw error;
  return data.value;
}

async function clearDrafts(as: SupabaseClient = adminClient) {
  await as.from("inventory_distribution_drafts").delete().not("id", "is", null);
}

let itemIds: string[];
let cleanupItems: () => Promise<void>;
let eventId: string;
let cleanupEvent: () => Promise<void>;
let coordinator: SupabaseClient;

beforeAll(async () => {
  const items = await createAvailableGearItems(4);
  itemIds = items.itemIds;
  cleanupItems = items.cleanup;
  const event = await createPublishedEvent();
  eventId = event.id;
  cleanupEvent = event.cleanup;
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
});

describe("distribution drafts (integration)", () => {
  test("adding creates one draft per event context, and a repeat scan is a no-op", async () => {
    for (const eventArg of [{}, { p_event_id: eventId }]) {
      for (let i = 0; i < 2; i++) {
        const { error } = await adminClient.rpc("add_to_distribution_draft", {
          p_item_id: itemIds[0],
          ...eventArg,
        });
        expect(error).toBeNull();
      }
    }

    const noEvent = await getDistributionDraft(adminClient, null);
    const forEvent = await getDistributionDraft(adminClient, eventId);
    expect(noEvent.draft?.items.map((item) => item.id)).toEqual([itemIds[0]]);
    expect(forEvent.draft?.items.map((item) => item.id)).toEqual([itemIds[0]]);
    expect(forEvent.draft?.eventName).toBeTruthy();
  });

  test("a draft is its owner's alone", async () => {
    await adminClient.rpc("add_to_distribution_draft", {
      p_item_id: itemIds[0],
    });

    const { count } = await coordinator
      .from("inventory_distribution_drafts")
      .select("id", { count: "exact", head: true });
    expect(count ?? 0).toBe(0);
    const { count: itemCount } = await coordinator
      .from("inventory_distribution_draft_items")
      .select("id", { count: "exact", head: true });
    expect(itemCount ?? 0).toBe(0);
  });

  test("a session without a record-distribution permission cannot keep one", async () => {
    // The seeded volunteer holds inventory_intake:manage -- the intake-table
    // carve-out -- and so may record a distribution, and keep a draft.
    const actors = (await unprivilegedActors()).filter(
      ({ name }) => name !== "volunteer",
    );
    for (const { name, client } of actors) {
      const { error } = await client.rpc("add_to_distribution_draft", {
        p_item_id: itemIds[0],
      });
      expect(error, name).not.toBeNull();
    }
  });

  test("recording a draft records one movement per piece and clears the list", async () => {
    for (const id of itemIds.slice(0, 2)) {
      await adminClient.rpc("add_to_distribution_draft", { p_item_id: id });
    }

    const { data, error } = await adminClient.rpc("record_distribution_draft", {
      p_reason: "draft integration test",
    });
    expect(error).toBeNull();
    expect(data).toBe(2);

    for (const id of itemIds.slice(0, 2)) {
      expect(await getInventoryItemStatus(id)).toBe("distributed");
    }
    const { count } = await adminClient
      .from("inventory_movements")
      .select("id", { count: "exact", head: true })
      .in("inventory_item_id", itemIds.slice(0, 2))
      .eq("movement_type", "distributed")
      .eq("reason", "draft integration test");
    expect(count).toBe(2);
    expect((await getDistributionDraft(adminClient, null)).draft).toBeNull();
  });

  test("one piece already given out records nothing and names that piece", async () => {
    // itemIds[0] was distributed by the previous test.
    await adminClient.rpc("add_to_distribution_draft", {
      p_item_id: itemIds[2],
    });
    await adminClient.rpc("add_to_distribution_draft", {
      p_item_id: itemIds[0],
    });

    const { error } = await adminClient.rpc("record_distribution_draft", {});
    expect(error?.message).toBe("ITEM_ALREADY_DISTRIBUTED");
    expect(error?.details).toBe(itemIds[0]);
    expect(await getInventoryItemStatus(itemIds[2])).toBe("available");
    expect(
      (await getDistributionDraft(adminClient, null)).draft?.items,
    ).toHaveLength(2);
  });

  test("recording an empty draft is refused", async () => {
    const { error } = await adminClient.rpc("record_distribution_draft", {});
    expect(error?.message).toBe("DRAFT_EMPTY");
  });
});

describe("the tag resolver with a distribution in progress (integration)", () => {
  test("with no draft it still redirects to the item", async () => {
    const code = await assetTag(itemIds[3]);
    expect(await resolve(code, adminClient)).toEqual({
      redirect: `/portal/inventory/items?item=${itemIds[3]}`,
    });
  });

  test("with a draft it offers the list, and adding puts the item on it", async () => {
    const { data: tag } = await adminClient
      .from("inventory_item_tags")
      .select("value")
      .eq("item_id", itemIds[3])
      .eq("kind", "asset_tag")
      .single();
    const code = tag!.value;

    await adminClient.rpc("add_to_distribution_draft", {
      p_item_id: itemIds[2],
      p_event_id: eventId,
    });
    expect(await resolve(code, adminClient)).toEqual({ rendered: true });

    currentSupabase = adminClient;
    const form = new FormData();
    form.set("code", code.toLowerCase());
    let redirected = "";
    try {
      await addTagToCurrentDistributionAction(form);
    } catch (error) {
      if (!(error instanceof Redirect)) throw error;
      redirected = error.url;
    }
    expect(redirected).toBe(`/portal/t/${code.toLowerCase()}?added=1`);

    const draft = await getCurrentDistributionDraft(adminClient);
    expect(draft?.eventId).toBe(eventId);
    expect(draft?.items.map((item) => item.id)).toEqual([
      itemIds[2],
      itemIds[3],
    ]);
  });

  test("an unknown code is still the plain not-found with a draft open", async () => {
    await adminClient.rpc("add_to_distribution_draft", {
      p_item_id: itemIds[2],
    });
    expect(await resolve("ZZZZZZ", adminClient)).toEqual({ notFound: true });
  });

  test("a draft left untouched for half a day is not offered", async () => {
    await adminClient.rpc("add_to_distribution_draft", {
      p_item_id: itemIds[2],
    });
    const later = Date.now() + 13 * 60 * 60 * 1000;
    expect(await getCurrentDistributionDraft(adminClient, later)).toBeNull();
  });
});
