// Integration test: exercises the real createDonationAction against a real
// local Supabase stack (checkUser/checkAnyPermission, create_donation_with_items
// RPC, RLS). Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  cleanupDonation,
  createDonation,
  signIn,
} from "../../../../../test/integration-setup";
import type { CreateDonationInput } from "./donation-form";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  createDonationAction,
  listEventDonationsAction,
  listRecentDonationsAction,
} = await import("./actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

function donationInput(overrides?: Partial<CreateDonationInput>) {
  return {
    isAnonymous: false,
    donorName: "Integration Test Donor",
    sourceType: "individual",
    items: [{ description: "Winter coat", type: "coat", condition: "good" }],
    ...overrides,
  } satisfies CreateDonationInput;
}

describe("createDonationAction (integration)", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();
    const result = await createDonationAction(donationInput());
    expect(result).toEqual({
      error: "You must be signed in to record a donation.",
    });
  });

  test("finance role can record a donation", async () => {
    currentSupabase = await signIn(SEEDED_USERS.finance);
    const result = await createDonationAction(donationInput());

    expect(result).toEqual({ success: true, giveaway: null });
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/home");
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/inventory/items");

    const { data } = await adminClient
      .from("donations")
      .select("id, donor:people(name)")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect((data as unknown as { donor: { name: string } }).donor.name).toBe(
      "Integration Test Donor",
    );
    if (data) await cleanupDonation((data as { id: string }).id);
  });

  test("volunteer role (inventory_intake manage) can also record a donation", async () => {
    currentSupabase = await signIn(SEEDED_USERS.volunteer);
    const result = await createDonationAction(donationInput());

    expect(result).toEqual({ success: true, giveaway: null });

    const { data } = await adminClient
      .from("donations")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (data) await cleanupDonation((data as { id: string }).id);
  });

  test("board role cannot record a donation", async () => {
    currentSupabase = await signIn(SEEDED_USERS.board);
    const result = await createDonationAction(donationInput());

    expect(result).toEqual({
      error: "You don't have permission to perform this action.",
    });
  });

  test("event_coordinator role cannot record a donation", async () => {
    currentSupabase = await signIn(SEEDED_USERS.coordinator);
    const result = await createDonationAction(donationInput());

    expect(result).toEqual({
      error: "You don't have permission to perform this action.",
    });
  });

  test("a deactivated (former) account cannot record a donation", async () => {
    currentSupabase = await signIn(SEEDED_USERS.former);
    const result = await createDonationAction(donationInput());

    expect(result).toEqual({
      error: "You don't have permission to perform this action.",
    });
  });
});

const DENIED = { error: "You don't have permission to perform this action." };

describe("listEventDonationsAction (integration)", () => {
  test("an anonymous session cannot list donations", async () => {
    currentSupabase = anonClient();
    const result = await listEventDonationsAction(crypto.randomUUID());
    expect(result).toEqual(DENIED);
  });

  test("finance role (finance:view) can list an event's donations", async () => {
    const donation = await createDonation();
    currentSupabase = await signIn(SEEDED_USERS.finance);
    const result = await listEventDonationsAction(crypto.randomUUID());
    expect("data" in result).toBe(true);
    await donation.cleanup();
  });

  test("event_coordinator role (no finance access) cannot list donations", async () => {
    currentSupabase = await signIn(SEEDED_USERS.coordinator);
    const result = await listEventDonationsAction(crypto.randomUUID());
    expect(result).toEqual(DENIED);
  });

  test("board role (no finance access) cannot list donations", async () => {
    currentSupabase = await signIn(SEEDED_USERS.board);
    const result = await listEventDonationsAction(crypto.randomUUID());
    expect(result).toEqual(DENIED);
  });

  test("volunteer role (inventory_intake manage only) cannot list donations", async () => {
    currentSupabase = await signIn(SEEDED_USERS.volunteer);
    const result = await listEventDonationsAction(crypto.randomUUID());
    expect(result).toEqual(DENIED);
  });
});

describe("listRecentDonationsAction (integration)", () => {
  test("an anonymous session cannot list recent donations", async () => {
    currentSupabase = anonClient();
    const result = await listRecentDonationsAction(5);
    expect(result).toEqual(DENIED);
  });

  test("admin role can list recent donations", async () => {
    const donation = await createDonation();
    currentSupabase = await signIn(SEEDED_USERS.admin);
    const result = await listRecentDonationsAction(5);
    expect("data" in result).toBe(true);
    await donation.cleanup();
  });

  test("a deactivated (former) account cannot list recent donations", async () => {
    currentSupabase = await signIn(SEEDED_USERS.former);
    const result = await listRecentDonationsAction(5);
    expect(result).toEqual(DENIED);
  });
});

// No Server Action exposes updating or deleting a donation record -- these
// tests hit the `donations` table directly (via the real signed-in client,
// same as the app's Supabase client) to cover the RLS policies themselves
// per the mapping in 20260822100000_role_scoped_rls_data_driven.sql: update
// -> finance:manage, delete -> is_admin() only (finance never had delete,
// kept admin-only rather than widened to finance:manage).
describe("donations table RLS (integration, no Server Action to exercise)", () => {
  test("finance role (finance:manage) can update a donation directly", async () => {
    const donation = await createDonation();
    const client = await signIn(SEEDED_USERS.finance);

    const { error } = await client
      .from("donations")
      .update({ notes: "Updated by finance" })
      .eq("id", donation.id);
    expect(error).toBeNull();

    const { data } = await adminClient
      .from("donations")
      .select("notes")
      .eq("id", donation.id)
      .single();
    expect(data?.notes).toBe("Updated by finance");

    await donation.cleanup();
  });

  test("volunteer role (insert-only carve-out) cannot update a donation directly", async () => {
    const donation = await createDonation();
    const client = await signIn(SEEDED_USERS.volunteer);

    await client
      .from("donations")
      .update({ notes: "Attempted volunteer edit" })
      .eq("id", donation.id);

    const { data } = await adminClient
      .from("donations")
      .select("notes")
      .eq("id", donation.id)
      .single();
    expect(data?.notes).toBeNull();

    await donation.cleanup();
  });

  test("admin role (is_admin()) can delete a donation directly", async () => {
    const donation = await createDonation();
    const client = await signIn(SEEDED_USERS.admin);

    // inventory_items.donation_id has no ON DELETE CASCADE, so the backing
    // item/movement rows must go first (same order as cleanupDonation) --
    // this test is only exercising the `donations` delete policy itself.
    const { data: items } = await client
      .from("inventory_items")
      .select("id")
      .eq("donation_id", donation.id);
    const itemIds = (items ?? []).map((item) => item.id as string);
    await client
      .from("inventory_movements")
      .delete()
      .in("inventory_item_id", itemIds);
    await client
      .from("inventory_items")
      .delete()
      .eq("donation_id", donation.id);

    const { error } = await client
      .from("donations")
      .delete()
      .eq("id", donation.id);
    expect(error).toBeNull();

    const { data } = await adminClient
      .from("donations")
      .select("id")
      .eq("id", donation.id)
      .maybeSingle();
    expect(data).toBeNull();
  });

  test("finance role (finance:manage but not admin) cannot delete a donation directly", async () => {
    const donation = await createDonation();
    const client = await signIn(SEEDED_USERS.finance);

    await client.from("donations").delete().eq("id", donation.id);

    const { data } = await adminClient
      .from("donations")
      .select("id")
      .eq("id", donation.id)
      .maybeSingle();
    expect(data?.id).toBe(donation.id);

    await donation.cleanup();
  });
});
