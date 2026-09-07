// Integration test: exercises the `org_fiscal_year` view against a real local
// Supabase stack. The pure date math is covered by fiscal-year.test.ts; what
// can only be checked here is the reason the view exists at all -- app_settings'
// select policy admits only system_settings/event_expenses/content_calendar
// managers, but the fiscal year is needed by anyone who can see the dashboard,
// so the view has to expose this one key to every authenticated role without
// handing out the approval thresholds alongside it.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { describe, expect, test } from "bun:test";
import {
  SEEDED_USERS,
  anonClient,
  signInAs,
} from "../../test/integration-setup";
import {
  DEFAULT_FISCAL_YEAR_START_MONTH,
  getFiscalYearStartMonth,
  isFiscalYearStartMonth,
} from "./fiscal-year";

// Every seeded role needs the fiscal year to render the pages it can see, so
// all of them must be able to read the view.
const FISCAL_YEAR_READERS = [
  ["finance", SEEDED_USERS.finance],
  ["event_coordinator", SEEDED_USERS.coordinator],
  ["volunteer", SEEDED_USERS.volunteer],
  ["no-role", SEEDED_USERS.noAccess],
] as const;

describe("org_fiscal_year (integration)", () => {
  test("seed.sql pins the start month, and it is a valid month", async () => {
    const supabase = await signInAs(SEEDED_USERS.admin);
    const startMonth = await getFiscalYearStartMonth(supabase);

    expect(isFiscalYearStartMonth(startMonth)).toBe(true);
    expect(startMonth).toBe(DEFAULT_FISCAL_YEAR_START_MONTH);
  });

  for (const [label, email] of FISCAL_YEAR_READERS) {
    test(`${label} can read the fiscal year`, async () => {
      const supabase = await signInAs(email);

      // The view itself resolves -- asserted through the raw query rather than
      // getFiscalYearStartMonth, whose fallback would return the same
      // plausible number and hide a broken grant.
      const { data, error } = await supabase
        .from("org_fiscal_year")
        .select("start_month")
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.start_month).toBe(DEFAULT_FISCAL_YEAR_START_MONTH);
    });
  }

  // The reason for the view. `finance` and `event_coordinator` can already read
  // app_settings (via event_expenses:manage and content_calendar respectively),
  // but volunteer and no-role accounts cannot -- and they still see the
  // dashboard, so they still need the fiscal year. Widening the table's select
  // policy for them would hand them the approval thresholds too.
  const ROLES_DENIED_APP_SETTINGS = [
    ["volunteer", SEEDED_USERS.volunteer],
    ["no-role", SEEDED_USERS.noAccess],
  ] as const;

  for (const [label, email] of ROLES_DENIED_APP_SETTINGS) {
    test(`${label} reads the fiscal year without gaining app_settings access`, async () => {
      const supabase = await signInAs(email);

      expect(await getFiscalYearStartMonth(supabase)).toBe(
        DEFAULT_FISCAL_YEAR_START_MONTH,
      );

      const { data: settings } = await supabase
        .from("app_settings")
        .select("key")
        .eq("key", "finance.expense_approval_threshold");
      expect(settings ?? []).toHaveLength(0);
    });
  }

  test("is not readable anonymously", async () => {
    // Unlike public_page_visibility, nothing on the public site depends on the
    // fiscal year, so anon has no grant here.
    const { data } = await anonClient()
      .from("org_fiscal_year")
      .select("start_month");
    expect(data ?? []).toHaveLength(0);
  });

  test("falls back to the default rather than throwing when the read fails", async () => {
    // A signed-out client can't see the view, which stands in for the
    // "misconfigured grant" case: the page must still render.
    const startMonth = await getFiscalYearStartMonth(anonClient());
    expect(startMonth).toBe(DEFAULT_FISCAL_YEAR_START_MONTH);
  });
});
