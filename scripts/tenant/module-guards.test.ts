import { describe, expect, test } from "bun:test";
import {
  TenantModuleError,
  assertModuleChange,
  type ModuleRow,
  type TenantRow,
} from "./module-guards";

function tenant(overrides: Partial<TenantRow> = {}): TenantRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Example Nonprofit",
    slug: "example-nonprofit",
    plan: "white_label",
    status: "active",
    ...overrides,
  };
}

const catalog: ModuleRow[] = [
  { key: "finance", label: "Finance", is_core: false },
  { key: "inventory", label: "Inventory", is_core: false },
  { key: "people", label: "People", is_core: true },
  { key: "administration", label: "Administration", is_core: true },
];

describe("assertModuleChange", () => {
  test("allows turning an ordinary module off for a customer", () => {
    expect(
      assertModuleChange({
        tenant: tenant(),
        catalog,
        requestedKey: "finance",
        enabled: false,
      }).label,
    ).toBe("Finance");
  });

  test("allows turning one back on", () => {
    expect(
      assertModuleChange({
        tenant: tenant(),
        catalog,
        requestedKey: "inventory",
        enabled: true,
      }).key,
    ).toBe("inventory");
  });

  test("refuses a tenant that does not exist", () => {
    expect(() =>
      assertModuleChange({
        tenant: null,
        catalog,
        requestedKey: "finance",
        enabled: false,
      }),
    ).toThrow(TenantModuleError);
  });

  test("refuses an unknown key, and lists the real ones", () => {
    // A typo is the whole reason this check exists: writing an unknown key
    // through the CLI would otherwise fail on a foreign key, or -- worse for a
    // `--disable` -- match nothing and report success.
    expect(() =>
      assertModuleChange({
        tenant: tenant(),
        catalog,
        requestedKey: "finanace",
        enabled: false,
      }),
    ).toThrow(
      /is not a module[\s\S]*finance, inventory, people, administration/,
    );
  });

  test("refuses disabling a core module, for anyone", () => {
    for (const key of ["people", "administration"]) {
      expect(() =>
        assertModuleChange({
          tenant: tenant(),
          catalog,
          requestedKey: key,
          enabled: false,
        }),
      ).toThrow(TenantModuleError);
    }
  });

  test("but enabling a core module is a no-op, not an error", () => {
    expect(
      assertModuleChange({
        tenant: tenant(),
        catalog,
        requestedKey: "people",
        enabled: true,
      }).key,
    ).toBe("people");
  });

  test("refuses disabling anything on the platform tenant", () => {
    // The database has no opinion here -- `tenants.plan` is not something
    // tenant_modules knows about -- so this guard is the only check there is,
    // exactly like the last-internal-tenant rule in plan-guards.ts.
    expect(() =>
      assertModuleChange({
        tenant: tenant({ plan: "internal", slug: "platform" }),
        catalog,
        requestedKey: "finance",
        enabled: false,
      }),
    ).toThrow(/platform tenant/);
  });

  test("but allows enabling one there", () => {
    expect(
      assertModuleChange({
        tenant: tenant({ plan: "internal" }),
        catalog,
        requestedKey: "finance",
        enabled: true,
      }).key,
    ).toBe("finance");
  });

  test("a demo tenant is an ordinary customer here", () => {
    expect(
      assertModuleChange({
        tenant: tenant({ plan: "demo" }),
        catalog,
        requestedKey: "finance",
        enabled: false,
      }).key,
    ).toBe("finance");
  });
});
