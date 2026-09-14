// Integration test: exercises the `org_timezone` view against a real local
// Supabase stack (#1065). The reason the view exists is the only thing worth
// checking here, and it cannot be checked with a mock: app_settings' select
// policy admits six `manage` permissions, and anyone who can open a report or
// a dashboard tile needs the reporting zone. The view has to hand that one key
// to every signed-in member without handing out the approval thresholds beside
// it -- the same shape as org_fiscal_year and org_sales_tax, and tested the
// same way.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { describe, expect, test } from "bun:test";
import {
  SEEDED_USERS,
  anonClient,
  signInAs,
} from "../../test/integration-setup";
import {
  DEFAULT_ORG_TIME_ZONE,
  getOrgTimeZone,
  isOrgTimeZone,
} from "./org-timezone";

// Every seeded role, including the two that cannot read app_settings at all:
// the view's audience is "any signed-in member", as org_sales_tax's is.
const ZONE_READERS = [
  ["admin", SEEDED_USERS.admin],
  ["finance", SEEDED_USERS.finance],
  ["event_coordinator", SEEDED_USERS.coordinator],
  ["volunteer", SEEDED_USERS.volunteer],
  ["no-role", SEEDED_USERS.noAccess],
] as const;

describe("org_timezone (integration)", () => {
  test("a tenant has a zone, and it is not silently UTC", async () => {
    // 20260916000000 takes the mode of `events.timezone` rather than
    // defaulting every tenant to UTC. It runs before seed.sql on a local
    // reset, when there are no events yet to infer from, so seed.sql pins the
    // answer that inference would have given: every seeded event is in Denver.
    const supabase = await signInAs(SEEDED_USERS.admin);
    const zone = await getOrgTimeZone(supabase);

    expect(isOrgTimeZone(zone)).toBe(true);
    expect(zone).toBe("America/Denver");
  });

  for (const [label, email] of ZONE_READERS) {
    test(`${label} can read the zone`, async () => {
      const supabase = await signInAs(email);

      // The raw query rather than getOrgTimeZone, whose fallback returns a
      // usable zone either way and would hide a broken grant.
      const { data, error } = await supabase
        .from("org_timezone")
        .select("zone")
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.zone).toBe("America/Denver");
    });
  }

  test("a volunteer reads the zone without gaining app_settings access", async () => {
    const supabase = await signInAs(SEEDED_USERS.volunteer);

    const { error } = await supabase
      .from("org_timezone")
      .select("zone")
      .maybeSingle();
    expect(error).toBeNull();

    const { data: settings } = await supabase
      .from("app_settings")
      .select("key")
      .eq("key", "org.timezone");
    expect(settings ?? []).toHaveLength(0);
  });

  test("is not readable anonymously", async () => {
    // Nothing on the public site is cut into reporting periods, so anon has no
    // grant.
    const { data } = await anonClient().from("org_timezone").select("zone");
    expect(data ?? []).toHaveLength(0);
  });

  test("is not writable through the view", async () => {
    // tenant_isolation_gaps() refuses a definer view with a write grant; this
    // is the same invariant from the client's side.
    const supabase = await signInAs(SEEDED_USERS.admin);
    const { error } = await supabase
      .from("org_timezone")
      .insert({ zone: "America/Chicago" });
    expect(error).not.toBeNull();
  });

  test("falls back to the default rather than throwing when the read fails", async () => {
    // A signed-out client can't see the view, which stands in for the
    // "misconfigured grant" case: a report must still open, on the boundary
    // every report used before #1065.
    expect(await getOrgTimeZone(anonClient())).toBe(DEFAULT_ORG_TIME_ZONE);
  });
});
