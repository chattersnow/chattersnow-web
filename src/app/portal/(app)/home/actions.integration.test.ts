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
  signIn,
} from "../../../../../test/integration-setup";
import type { CreateDonationInput } from "./donation-form";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { createDonationAction } = await import("./actions");

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

    expect(result).toEqual({ success: true });
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

    expect(result).toEqual({ success: true });

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
