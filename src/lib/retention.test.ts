import { describe, expect, test } from "bun:test";
import { RETENTION, RETENTION_POLICIES } from "./retention";

describe("retention policies", () => {
  test("every policy key is unique", () => {
    const keys = RETENTION_POLICIES.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("every policy carries prose for the published page", () => {
    for (const policy of RETENTION_POLICIES) {
      expect(policy.what.length).toBeGreaterThan(0);
      expect(policy.howLong.length).toBeGreaterThan(0);
    }
  });

  // The purge compares these strings to retention_policies.period directly, so
  // a period written as "24 months" here and "2 years" in the seed would read
  // as drift even though the clocks match. Keep the literals in the same shape
  // Postgres renders an interval in.
  test("periods are Postgres interval literals", () => {
    const interval = /^\d+ (day|days|month|months|year|years)$/;
    for (const policy of RETENTION_POLICIES) {
      expect(policy.period).toMatch(interval);
      if (policy.secondaryPeriod) {
        expect(policy.secondaryPeriod).toMatch(interval);
      }
    }
  });

  // Only volunteer applications have two clocks (the shorter one for
  // applications we declined or closed). A second one appearing here means the
  // purge needs a matching branch, which it will not have.
  test("only volunteer applications carry a secondary period", () => {
    const withSecondary = RETENTION_POLICIES.filter(
      (p) => p.secondaryPeriod,
    ).map((p) => p.key);
    expect(withSecondary).toEqual(["volunteer_applications"]);
  });

  test("RETENTION renders one entry per policy, in order", () => {
    expect(RETENTION.map((r) => r.what)).toEqual(
      RETENTION_POLICIES.map((p) => p.what),
    );
  });

  // #602 reworded this entry. The page used to say a portal account "is
  // removed", which the schema cannot do: audit_log.actor_id and ~120 other
  // actor columns reference auth.users with no ON DELETE. If this assertion
  // ever fails, check that the page is not promising deletion again.
  test("the portal accounts entry does not promise account deletion", () => {
    const portal = RETENTION_POLICIES.find((p) => p.key === "portal_accounts");
    expect(portal).toBeDefined();
    expect(portal!.howLong).toContain("permanently disable your access");
    expect(portal!.howLong).not.toContain("the account is removed");
  });
});
