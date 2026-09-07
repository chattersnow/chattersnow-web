import { describe, expect, test } from "bun:test";
import {
  TENANT_PLANS,
  TenantPlanError,
  assertPlanChange,
  type TenantRow,
} from "./plan-guards";

function tenant(overrides: Partial<TenantRow> = {}): TenantRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Chatter Snow",
    slug: "chatter-snow",
    plan: "internal",
    status: "active",
    ...overrides,
  };
}

describe("assertPlanChange", () => {
  test("allows the Phase 1 flip once a second internal tenant exists", () => {
    expect(
      assertPlanChange({
        tenant: tenant(),
        requestedPlan: "white_label",
        otherActiveInternalTenants: 1,
      }),
    ).toBe("white_label");
  });

  test("refuses a tenant that does not exist", () => {
    expect(() =>
      assertPlanChange({
        tenant: null,
        requestedPlan: "white_label",
        otherActiveInternalTenants: 1,
      }),
    ).toThrow(TenantPlanError);
  });

  test("refuses a plan the check constraint would reject", () => {
    expect(() =>
      assertPlanChange({
        tenant: tenant(),
        requestedPlan: "enterprise",
        otherActiveInternalTenants: 1,
      }),
    ).toThrow(/not a plan/);
  });

  test("refuses a change that would change nothing", () => {
    expect(() =>
      assertPlanChange({
        tenant: tenant({ plan: "white_label" }),
        requestedPlan: "white_label",
        otherActiveInternalTenants: 1,
      }),
    ).toThrow(/already on the white_label plan/);
  });

  // The one that matters: platform access is a membership inside an internal
  // tenant, so this would lock the deployment out of its own administration
  // with no second door.
  test("refuses to move the last active internal tenant off internal", () => {
    expect(() =>
      assertPlanChange({
        tenant: tenant(),
        requestedPlan: "white_label",
        otherActiveInternalTenants: 0,
      }),
    ).toThrow(/only active internal tenant/);
  });

  test("counts only other tenants, not this one", () => {
    // Guards against a caller that forgets the `neq` and counts the tenant it
    // is about to move -- which would let the last one through.
    expect(() =>
      assertPlanChange({
        tenant: tenant(),
        requestedPlan: "demo",
        otherActiveInternalTenants: 0,
      }),
    ).toThrow(/only active internal tenant/);
  });

  test("allows an already-archived internal tenant to be reclassified", () => {
    // It is not serving platform administration either way, so the lockout
    // this guard exists to prevent cannot happen.
    expect(
      assertPlanChange({
        tenant: tenant({ status: "archived" }),
        requestedPlan: "white_label",
        otherActiveInternalTenants: 0,
      }),
    ).toBe("white_label");
  });

  test("allows a tenant to be promoted to internal", () => {
    expect(
      assertPlanChange({
        tenant: tenant({ slug: "platform", plan: "white_label" }),
        requestedPlan: "internal",
        otherActiveInternalTenants: 0,
      }),
    ).toBe("internal");
  });

  test("every accepted plan is one the database allows", () => {
    expect([...TENANT_PLANS]).toEqual(["internal", "demo", "white_label"]);
  });
});
