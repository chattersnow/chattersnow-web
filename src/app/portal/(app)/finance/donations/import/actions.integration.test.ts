// Integration test: the donation import (#1390) against a real local Supabase
// stack -- `bulk_import_monetary_donations`' permission gate, its idempotent
// re-run and skip count, the `freeze_imported_figures` trigger, the
// `giving.import_mapping` round trip, and that Income is unchanged by a
// fee-bearing imported row. Requires `bun run db:start && bun run db:reset`
// first; run via `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  serviceRoleClient,
  signInAs,
} from "../../../../../../../test/integration-setup";
import { SEEDED_USER_IDS } from "../../../../../../../test/seed-fixtures";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { importDonationsAction } = await import("./actions");

const MAPPING = {
  external_reference: "id",
  amount: "Net",
  gross_amount: "Amount",
  fee_amount: "Fee",
  received_at: "Created (UTC)",
  notes: "Description",
};

/** A reference nothing else in the database can collide with. */
const run = crypto.randomUUID().slice(0, 8);
const ref = (n: number) => `it_${run}_${n}`;

function csv(lines: string[]) {
  return ["id,Amount,Fee,Net,Created (UTC),Description", ...lines].join("\n");
}

async function importedRows() {
  const { data, error } = await adminClient
    .from("monetary_donations")
    .select(
      "id, amount, gross_amount, fee_amount, received_date, source, external_reference, processor_label, donor_id, method, notes",
    )
    .like("external_reference", `it_${run}_%`)
    .order("external_reference");
  if (error) throw error;
  return data ?? [];
}

afterAll(async () => {
  await adminClient
    .from("monetary_donations")
    .delete()
    .like("external_reference", `it_${run}_%`);
});

describe("importDonationsAction — the permission gate", () => {
  test("an anonymous session imports nothing", async () => {
    currentSupabase = anonClient();
    const result = await importDonationsAction(
      csv([`${ref(0)},100.00,5.45,94.55,2026-03-04T17:00:00Z,`]),
      MAPPING,
      "Donorbox",
    );
    expect(result).toEqual({
      error: "You don't have permission to perform this action.",
    });
    expect(await importedRows()).toHaveLength(0);
  });

  test("a role without finance:manage imports nothing", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);
    const result = await importDonationsAction(
      csv([`${ref(0)},100.00,5.45,94.55,2026-03-04T17:00:00Z,`]),
      MAPPING,
      "Donorbox",
    );
    expect(result).toEqual({
      error: "You don't have permission to perform this action.",
    });
    expect(await importedRows()).toHaveLength(0);
  });
});

describe("importDonationsAction — what it writes", () => {
  beforeAll(async () => {
    currentSupabase = await signInAs(SEEDED_USERS.finance);
  });

  test("records what the organization received, with the split beside it", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.finance);
    const result = await importDonationsAction(
      csv([
        `${ref(1)},100.00,5.45,94.55,2026-03-04T17:00:00Z,Jane Doe`,
        `${ref(2)},50.00,,50.00,2026-03-05T17:00:00Z,`,
      ]),
      MAPPING,
      "Donorbox",
    );
    expect(result).toEqual({
      success: true,
      inserted: 2,
      duplicates: 0,
      invalid: 0,
    });

    const rows = await importedRows();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      source: "import",
      external_reference: ref(1),
      processor_label: "Donorbox",
      method: "online",
      // Never a person: the import leaves the directory alone.
      donor_id: null,
      notes: "Jane Doe",
    });
    expect(Number(rows[0].amount)).toBe(94.55);
    expect(Number(rows[0].gross_amount)).toBe(100);
    expect(Number(rows[0].fee_amount)).toBe(5.45);
    expect(rows[1].fee_amount).toBeNull();
  });

  test("buckets the instant onto the organization's own day (#1065)", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.finance);
    // 02:00 UTC on 1 March is 7pm on 28 February in America/Denver, the
    // seeded tenant's zone. February is the month that gift belongs to.
    await importDonationsAction(
      csv([`${ref(3)},10.00,,10.00,2026-03-01T02:00:00Z,`]),
      MAPPING,
      "Donorbox",
    );
    const row = (await importedRows()).find(
      (candidate) => candidate.external_reference === ref(3),
    );
    expect(row?.received_date).toBe("2026-02-28");
  });

  test("a re-run of an overlapping export is a no-op, not a duplicate", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.finance);
    const again = await importDonationsAction(
      csv([
        `${ref(1)},100.00,5.45,94.55,2026-03-04T17:00:00Z,Jane Doe`,
        `${ref(4)},20.00,,20.00,2026-03-06T17:00:00Z,`,
      ]),
      MAPPING,
      "Donorbox",
    );
    expect(again).toEqual({
      success: true,
      inserted: 1,
      duplicates: 1,
      invalid: 0,
    });
  });

  test("a row the file cannot offer is skipped and counted, not fatal", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.finance);
    const result = await importDonationsAction(
      csv([
        `${ref(5)},30.00,,30.00,2026-03-07T17:00:00Z,`,
        `${ref(6)},not money,,,2026-03-07T17:00:00Z,`,
      ]),
      MAPPING,
      "Donorbox",
    );
    expect(result).toEqual({
      success: true,
      inserted: 1,
      duplicates: 0,
      invalid: 1,
    });
  });
});

describe("an imported gift's figures are frozen", () => {
  test("the database refuses an amount change even through a raw write", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.finance);
    await importDonationsAction(
      csv([`${ref(7)},80.00,2.00,78.00,2026-03-08T17:00:00Z,`]),
      MAPPING,
      "Donorbox",
    );
    const row = (await importedRows()).find(
      (candidate) => candidate.external_reference === ref(7),
    );

    const { error } = await adminClient
      .from("monetary_donations")
      .update({ amount: 1 })
      .eq("id", row!.id);
    expect(error?.message).toContain("IMPORTED_DONATION_IS_READ_ONLY");

    // What a human legitimately adds afterwards still goes through.
    const { error: notesError } = await adminClient
      .from("monetary_donations")
      .update({ notes: "Thanked by post" })
      .eq("id", row!.id);
    expect(notesError).toBeNull();
  });
});

describe("cross-tenant isolation", () => {
  const service = serviceRoleClient();
  let otherTenantId: string | null = null;

  // Archived the moment it exists, and removed through `delete_tenant` rather
  // than a plain delete -- the shape the tenant-resolution suite settled on. A
  // second *active* tenant would take `public_tenant_id()` off its
  // sole-active fallback for every other file in the run, and a plain delete
  // is refused while the tenant still owns rows.
  afterAll(async () => {
    if (!otherTenantId) return;
    await service
      .from("tenants")
      .update({ status: "archived" })
      .eq("id", otherTenantId);
    await service.rpc("delete_tenant", { p_tenant_id: otherTenantId });
  });

  test("another tenant's row with the same transaction id is neither matched nor touched", async () => {
    const provisioned = await service.rpc("provision_tenant", {
      p_name: `Donation Import Other ${run}`,
      p_slug: `donimport-other-${run}`,
      p_custom_domain: `donimport-other-${run}.example.test`,
      p_plan: "white_label",
      p_admin_email: null,
    });
    if (provisioned.error) throw provisioned.error;
    otherTenantId = provisioned.data as string;
    const archived = await service
      .from("tenants")
      .update({ status: "archived" })
      .eq("id", otherTenantId);
    if (archived.error) throw archived.error;

    // The same reference, owned by somebody else. `created_by` defaults to
    // auth.uid(), which is null under service_role, so the seeded admin
    // stands in as the author the way the tenant-resolution suite does.
    const theirs = await service
      .from("monetary_donations")
      .insert({
        tenant_id: otherTenantId,
        amount: 7,
        method: "online",
        received_date: "2026-03-04",
        source: "import",
        external_reference: ref(1),
        created_by: SEEDED_USER_IDS.admin,
      })
      .select("id")
      .single();
    if (theirs.error) throw theirs.error;

    // ref(1) is already imported into the seeded tenant, so this re-run must
    // skip it there -- and must leave the other tenant's identically
    // referenced row exactly as it was.
    currentSupabase = await signInAs(SEEDED_USERS.finance);
    const result = await importDonationsAction(
      csv([`${ref(1)},100.00,5.45,94.55,2026-03-04T17:00:00Z,Jane Doe`]),
      MAPPING,
      "Donorbox",
    );
    expect(result).toMatchObject({ inserted: 0, duplicates: 1 });

    const after = await service
      .from("monetary_donations")
      .select("amount, processor_label")
      .eq("id", theirs.data.id)
      .single();
    if (after.error) throw after.error;
    expect(Number(after.data.amount)).toBe(7);
    expect(after.data.processor_label).toBeNull();
  });
});

describe("the remembered column mapping", () => {
  test("a successful import remembers it, and finance:view can read it back", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.finance);
    await importDonationsAction(
      csv([`${ref(8)},40.00,,40.00,2026-03-09T17:00:00Z,`]),
      MAPPING,
      "Donorbox",
    );

    const client = await signInAs(SEEDED_USERS.finance);
    const { data, error } = await client.rpc("get_donation_import_mapping");
    expect(error).toBeNull();
    expect(data).toMatchObject(MAPPING);
  });

  test("a role without finance:manage cannot write one", async () => {
    const client = await signInAs(SEEDED_USERS.coordinator);
    const { error } = await client.rpc("set_donation_import_mapping", {
      p_mapping: { amount: "Whatever" },
    });
    expect(error?.message).toContain("PERMISSION_DENIED");
  });

  test("a field the import does not know is refused", async () => {
    const client = await signInAs(SEEDED_USERS.finance);
    const { error } = await client.rpc("set_donation_import_mapping", {
      p_mapping: { donor_email: "Email" },
    });
    expect(error?.message).toContain("IMPORT_MAPPING_INVALID");
  });
});

describe("Income is unchanged by a fee-bearing imported row", () => {
  test("the rollup counts what was received, not the gross", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.finance);
    const client = await signInAs(SEEDED_USERS.admin);

    const before = await client.rpc("get_finance_report_data", {
      p_from: "2026-04-01",
      p_to: "2026-04-30",
    });
    const beforeTotal = (
      (before.data?.monetary_donations ?? []) as { amount: number | string }[]
    ).reduce((sum, row) => sum + Number(row.amount), 0);

    await importDonationsAction(
      csv([`${ref(9)},100.00,5.45,94.55,2026-04-15T17:00:00Z,`]),
      MAPPING,
      "Donorbox",
    );

    const after = await client.rpc("get_finance_report_data", {
      p_from: "2026-04-01",
      p_to: "2026-04-30",
    });
    const afterTotal = (
      (after.data?.monetary_donations ?? []) as { amount: number | string }[]
    ).reduce((sum, row) => sum + Number(row.amount), 0);

    // 94.55, the money that landed -- not 100, the donor's gross.
    expect(Number((afterTotal - beforeTotal).toFixed(2))).toBe(94.55);
  });
});
