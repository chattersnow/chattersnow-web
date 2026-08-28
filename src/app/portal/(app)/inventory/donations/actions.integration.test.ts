// Integration test: exercises the real updateDonationAction against a real
// local Supabase stack (checkUser/checkAnyPermission, donations RLS), plus
// the widened `donations select` RLS policy from
// 20260828020000_widen_donations_rls_for_inventory.sql directly against the
// table (no Server Action lists donations for the Inventory Donations page --
// it queries the table straight from the Server Component, same pattern
// `home/actions.integration.test.ts` already uses for donations table RLS).
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  anonClient,
  createDonation,
  signIn,
} from "../../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { updateDonationAction } = await import("./actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

function editFormData(donatedAt = "2026-06-01", notes = "Updated notes") {
  const formData = new FormData();
  formData.set("donatedAt", donatedAt);
  formData.set("notes", notes);
  return formData;
}

const DENIED = { error: "You don't have permission to perform this action." };

describe("updateDonationAction (integration)", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();
    const result = await updateDonationAction(
      crypto.randomUUID(),
      editFormData(),
    );
    expect(result).toEqual({
      error: "You must be signed in to update a donation.",
    });
  });

  test("finance role (finance:manage) can update a donation", async () => {
    const donation = await createDonation();
    currentSupabase = await signIn(SEEDED_USERS.finance);

    const result = await updateDonationAction(donation.id, editFormData());
    expect(result).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/inventory/donations",
    );

    await donation.cleanup();
  });

  test("admin role (inventory:manage) can update a donation", async () => {
    const donation = await createDonation();
    currentSupabase = await signIn(SEEDED_USERS.admin);

    const result = await updateDonationAction(donation.id, editFormData());
    expect(result).toEqual({ success: true });

    await donation.cleanup();
  });

  test("volunteer role (inventory_intake manage only) cannot update a donation", async () => {
    const donation = await createDonation();
    currentSupabase = await signIn(SEEDED_USERS.volunteer);

    const result = await updateDonationAction(donation.id, editFormData());
    expect(result).toEqual(DENIED);

    await donation.cleanup();
  });

  test("board role cannot update a donation", async () => {
    const donation = await createDonation();
    currentSupabase = await signIn(SEEDED_USERS.board);

    const result = await updateDonationAction(donation.id, editFormData());
    expect(result).toEqual(DENIED);

    await donation.cleanup();
  });

  test("event_coordinator role cannot update a donation", async () => {
    const donation = await createDonation();
    currentSupabase = await signIn(SEEDED_USERS.coordinator);

    const result = await updateDonationAction(donation.id, editFormData());
    expect(result).toEqual(DENIED);

    await donation.cleanup();
  });

  test("rejects a missing date received", async () => {
    const donation = await createDonation();
    currentSupabase = await signIn(SEEDED_USERS.admin);

    const result = await updateDonationAction(donation.id, editFormData(""));
    expect(result).toEqual({ error: "Date received is required." });

    await donation.cleanup();
  });
});

// Covers the RLS change in 20260828020000_widen_donations_rls_for_inventory:
// select widened from finance:view only to also admit inventory:manage and
// inventory_intake:manage, matching the Inventory Donations page's own route
// gate (layout.tsx). No Server Action lists donations for this page -- it
// queries the table directly from the Server Component -- so this exercises
// the table policy directly, same as the pre-existing RLS-only tests in
// home/actions.integration.test.ts.
describe("donations select RLS widened for inventory (integration)", () => {
  test("finance role (finance:view) can still select donations", async () => {
    const donation = await createDonation();
    const client = await signIn(SEEDED_USERS.finance);

    const { data, error } = await client
      .from("donations")
      .select("id")
      .eq("id", donation.id)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(donation.id);

    await donation.cleanup();
  });

  test("admin role (inventory:manage) can select donations", async () => {
    const donation = await createDonation();
    const client = await signIn(SEEDED_USERS.admin);

    const { data, error } = await client
      .from("donations")
      .select("id")
      .eq("id", donation.id)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(donation.id);

    await donation.cleanup();
  });

  test("volunteer role (inventory_intake:manage) can now select the donation it recorded", async () => {
    const donation = await createDonation();
    const client = await signIn(SEEDED_USERS.volunteer);

    const { data, error } = await client
      .from("donations")
      .select("id")
      .eq("id", donation.id)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.id).toBe(donation.id);

    await donation.cleanup();
  });

  test("board role (no finance/inventory access) still cannot select donations", async () => {
    const donation = await createDonation();
    const client = await signIn(SEEDED_USERS.board);

    const { data } = await client
      .from("donations")
      .select("id")
      .eq("id", donation.id)
      .maybeSingle();
    expect(data).toBeNull();

    await donation.cleanup();
  });
});
