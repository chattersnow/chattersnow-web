import { describe, expect, test } from "bun:test";
import {
  DemoGuardError,
  assertDemoTenant,
  requireEnv,
  type TenantRow,
} from "./guards";

function tenant(overrides: Partial<TenantRow> = {}): TenantRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Demo Organization",
    slug: "demo",
    plan: "demo",
    status: "active",
    ...overrides,
  };
}

describe("assertDemoTenant", () => {
  test("accepts a demo tenant", () => {
    const row = tenant();
    expect(assertDemoTenant(row)).toBe(row);
  });

  test("refuses a tenant that does not exist", () => {
    expect(() => assertDemoTenant(null)).toThrow(DemoGuardError);
  });

  // The two that matter: the reset archives and deletes whatever it is given,
  // and delete_tenant() does not care whose tenant it is.
  test("refuses the internal tenant", () => {
    expect(() => assertDemoTenant(tenant({ plan: "internal" }))).toThrow(
      /plan is "internal"/,
    );
  });

  test("refuses a paying tenant", () => {
    expect(() => assertDemoTenant(tenant({ plan: "white_label" }))).toThrow(
      /plan is "white_label"/,
    );
  });

  test("refuses the Chatter Snow slug even when the plan says demo", () => {
    expect(() => assertDemoTenant(tenant({ slug: "chatter-snow" }))).toThrow(
      /never the demo/,
    );
  });
});

describe("requireEnv", () => {
  test("returns the trimmed values", () => {
    expect(requireEnv({ A: " one ", B: "two" }, ["A", "B"])).toEqual({
      A: "one",
      B: "two",
    });
  });

  test("refuses a missing variable", () => {
    expect(() => requireEnv({ A: "one" }, ["A", "B"])).toThrow(
      /Missing required env: B/,
    );
  });

  test("refuses a variable set to whitespace", () => {
    expect(() => requireEnv({ A: "   " }, ["A"])).toThrow(
      /Missing required env: A/,
    );
  });
});
