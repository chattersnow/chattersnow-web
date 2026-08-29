// Integration test: exercises the real monetary_donations Server Actions
// (createDonationAction, updateDonationAction, deleteDonationAction) against
// a real local Supabase stack -- checkPermission, then real
// `monetary_donations` RLS. The table reuses the `finance` resource
// (20260829100000_create_monetary_donations.sql): admin/finance manage,
// everyone else none -- note event_coordinator is denied here, unlike
// event_revenue, because monetary donations are org-level finance records,
// not event operations. Board's oversight comes only through the
// finance_reports rollup RPC. Requires `bun run db:start && bun run
// db:reset` first; run via `bun run test:integration`. Not picked up by
// `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createMonetaryDonation,
  createPerson,
  signIn,
} from "../../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { createDonationAction, updateDonationAction, deleteDonationAction } =
  await import("./actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const DENIED = { error: "You don't have permission to perform this action." };

function donationForm(overrides?: {
  donorId?: string;
  amount?: number;
  method?: string;
  notes?: string;
}) {
  const fd = new FormData();
  fd.set("donorId", overrides?.donorId ?? "");
  fd.set("method", overrides?.method ?? "cash");
  fd.set("receivedDate", new Date().toISOString().slice(0, 10));
  fd.set("amount", String(overrides?.amount ?? 25));
  fd.set("notes", overrides?.notes ?? "");
  return fd;
}

async function donationRowByNotes(notes: string) {
  const { data, error } = await adminClient
    .from("monetary_donations")
    .select("id, donor_id, amount, method, notes")
    .eq("notes", notes)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function uniqueNotes() {
  return `Integration test gift ${crypto.randomUUID()}`;
}

describe("createDonationAction (integration)", () => {
  test("an anonymous session cannot create a donation", async () => {
    currentSupabase = anonClient();
    const result = await createDonationAction(donationForm());
    expect(result).toEqual(DENIED);
  });

  test("admin role (finance manage) can create a donation", async () => {
    currentSupabase = await signIn(SEEDED_USERS.admin);
    const notes = uniqueNotes();
    const result = await createDonationAction(
      donationForm({ amount: 250, notes }),
    );
    expect(result).toEqual({ success: true });

    const row = await donationRowByNotes(notes);
    expect(row).toMatchObject({ method: "cash", donor_id: null });
    expect(Number(row?.amount)).toBe(250);
    await adminClient.from("monetary_donations").delete().eq("id", row!.id);
  });

  test("finance role can create a donation linked to a donor", async () => {
    const donor = await createPerson();
    currentSupabase = await signIn(SEEDED_USERS.finance);
    const notes = uniqueNotes();
    const result = await createDonationAction(
      donationForm({ donorId: donor.id, method: "check", notes }),
    );
    expect(result).toEqual({ success: true });

    const row = await donationRowByNotes(notes);
    expect(row).toMatchObject({ donor_id: donor.id, method: "check" });
    await adminClient.from("monetary_donations").delete().eq("id", row!.id);
    await donor.cleanup();
  });

  test("finance role can create an anonymous donation (null donor)", async () => {
    currentSupabase = await signIn(SEEDED_USERS.finance);
    const notes = uniqueNotes();
    const result = await createDonationAction(donationForm({ notes }));
    expect(result).toEqual({ success: true });

    const row = await donationRowByNotes(notes);
    expect(row?.donor_id).toBeNull();
    await adminClient.from("monetary_donations").delete().eq("id", row!.id);
  });

  test("event_coordinator role (no finance access) cannot create a donation", async () => {
    currentSupabase = await signIn(SEEDED_USERS.coordinator);
    const result = await createDonationAction(donationForm());
    expect(result).toEqual(DENIED);
  });

  test("board role (no finance manage) cannot create a donation", async () => {
    currentSupabase = await signIn(SEEDED_USERS.board);
    const result = await createDonationAction(donationForm());
    expect(result).toEqual(DENIED);
  });

  test("volunteer role (no finance access) cannot create a donation", async () => {
    currentSupabase = await signIn(SEEDED_USERS.volunteer);
    const result = await createDonationAction(donationForm());
    expect(result).toEqual(DENIED);
  });

  test("a deactivated (former) account cannot create a donation", async () => {
    currentSupabase = await signIn(SEEDED_USERS.former);
    const result = await createDonationAction(donationForm());
    expect(result).toEqual(DENIED);
  });
});

describe("updateDonationAction (integration)", () => {
  test("finance role can update a donation", async () => {
    const donation = await createMonetaryDonation();
    currentSupabase = await signIn(SEEDED_USERS.finance);

    const result = await updateDonationAction(
      donation.id,
      donationForm({ amount: 999, method: "online" }),
    );
    expect(result).toEqual({ success: true });

    const { data } = await adminClient
      .from("monetary_donations")
      .select("amount, method")
      .eq("id", donation.id)
      .single();
    expect(Number(data?.amount)).toBe(999);
    expect(data?.method).toBe("online");
    await donation.cleanup();
  });

  test("board role (no finance manage) cannot update a donation", async () => {
    const donation = await createMonetaryDonation();
    currentSupabase = await signIn(SEEDED_USERS.board);

    const result = await updateDonationAction(donation.id, donationForm());
    expect(result).toEqual(DENIED);
    await donation.cleanup();
  });

  test("volunteer role (no finance access) cannot update a donation", async () => {
    const donation = await createMonetaryDonation();
    currentSupabase = await signIn(SEEDED_USERS.volunteer);

    const result = await updateDonationAction(donation.id, donationForm());
    expect(result).toEqual(DENIED);
    await donation.cleanup();
  });
});

describe("deleteDonationAction (integration)", () => {
  test("admin role can delete a donation", async () => {
    const donation = await createMonetaryDonation();
    currentSupabase = await signIn(SEEDED_USERS.admin);

    const result = await deleteDonationAction(donation.id);
    expect(result).toEqual({ success: true });

    const { data } = await adminClient
      .from("monetary_donations")
      .select("id")
      .eq("id", donation.id)
      .maybeSingle();
    expect(data).toBeNull();
  });

  test("board role (no finance manage) cannot delete a donation", async () => {
    const donation = await createMonetaryDonation();
    currentSupabase = await signIn(SEEDED_USERS.board);

    const result = await deleteDonationAction(donation.id);
    expect(result).toEqual(DENIED);
    await donation.cleanup();
  });
});

describe("monetary_donations RLS (integration)", () => {
  test("board role's session cannot select monetary donations directly", async () => {
    const donation = await createMonetaryDonation();
    const boardClient = await signIn(SEEDED_USERS.board);

    const { data, error } = await boardClient
      .from("monetary_donations")
      .select("id")
      .eq("id", donation.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
    await donation.cleanup();
  });

  test("a no-role account's session cannot select monetary donations", async () => {
    const donation = await createMonetaryDonation();
    const noAccessClient = await signIn(SEEDED_USERS.noAccess);

    const { data } = await noAccessClient
      .from("monetary_donations")
      .select("id")
      .eq("id", donation.id);
    expect(data).toEqual([]);
    await donation.cleanup();
  });

  test("finance role's session can select monetary donations", async () => {
    const donation = await createMonetaryDonation();
    const financeClient = await signIn(SEEDED_USERS.finance);

    const { data, error } = await financeClient
      .from("monetary_donations")
      .select("id")
      .eq("id", donation.id);
    expect(error).toBeNull();
    expect(data).toEqual([{ id: donation.id }]);
    await donation.cleanup();
  });
});
