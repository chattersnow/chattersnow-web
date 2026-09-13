// Integration test: exercises the `org_sales_tax` view against a real local
// Supabase stack (#997). The reason the view exists is the only thing worth
// checking here, and it cannot be checked with a mock: app_settings' select
// policy admits six `manage` permissions, and a `sales:manage` holder running
// the register may hold none of them. The view has to hand that one key to
// every signed-in member without handing out the approval thresholds beside
// it -- the same shape as org_fiscal_year, and tested the same way.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { describe, expect, test } from "bun:test";
import {
  SEEDED_USERS,
  anonClient,
  signInAs,
} from "../../test/integration-setup";
import {
  DEFAULT_SALES_TAX_RATE,
  getSalesTaxRate,
  isSalesTaxRate,
} from "./sales-tax";

// Every seeded role, including the two that cannot read app_settings at all:
// the view's audience is "any signed-in member", as org_fiscal_year's is.
const RATE_READERS = [
  ["admin", SEEDED_USERS.admin],
  ["finance", SEEDED_USERS.finance],
  ["event_coordinator", SEEDED_USERS.coordinator],
  ["volunteer", SEEDED_USERS.volunteer],
  ["no-role", SEEDED_USERS.noAccess],
] as const;

describe("org_sales_tax (integration)", () => {
  test("the migration seeds the rate at zero, and it is a valid rate", async () => {
    const supabase = await signInAs(SEEDED_USERS.admin);
    const rate = await getSalesTaxRate(supabase);

    expect(isSalesTaxRate(rate)).toBe(true);
    expect(rate).toBe(DEFAULT_SALES_TAX_RATE);
  });

  for (const [label, email] of RATE_READERS) {
    test(`${label} can read the rate`, async () => {
      const supabase = await signInAs(email);

      // The raw query rather than getSalesTaxRate, whose fallback returns the
      // same 0 and would hide a broken grant.
      const { data, error } = await supabase
        .from("org_sales_tax")
        .select("rate")
        .maybeSingle();
      expect(error).toBeNull();
      expect(Number(data?.rate)).toBe(DEFAULT_SALES_TAX_RATE);
    });
  }

  test("a volunteer reads the rate without gaining app_settings access", async () => {
    const supabase = await signInAs(SEEDED_USERS.volunteer);

    const { error } = await supabase
      .from("org_sales_tax")
      .select("rate")
      .maybeSingle();
    expect(error).toBeNull();

    const { data: settings } = await supabase
      .from("app_settings")
      .select("key")
      .eq("key", "finance.sales_tax_rate");
    expect(settings ?? []).toHaveLength(0);
  });

  test("is not readable anonymously", async () => {
    // Nothing on the public site prices merchandise, so anon has no grant.
    const { data } = await anonClient().from("org_sales_tax").select("rate");
    expect(data ?? []).toHaveLength(0);
  });

  test("is not writable through the view", async () => {
    // tenant_isolation_gaps() refuses a definer view with a write grant; this
    // is the same invariant from the client's side.
    const supabase = await signInAs(SEEDED_USERS.admin);
    const { error } = await supabase.from("org_sales_tax").insert({ rate: 5 });
    expect(error).not.toBeNull();
  });

  test("falls back to the default rather than throwing when the read fails", async () => {
    // A signed-out client can't see the view, which stands in for the
    // "misconfigured grant" case: the register must still open.
    expect(await getSalesTaxRate(anonClient())).toBe(DEFAULT_SALES_TAX_RATE);
  });
});
