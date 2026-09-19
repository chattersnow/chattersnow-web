import { beforeEach, describe, expect, mock, test } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithToaster } from "../../../../../test/toast-testing";
import { legalDocument } from "@/lib/legal-documents";
import type { PlatformTenant, TenantModule } from "./platform-shared";

const BLOCKED = legalDocument("terms")!.gates[0].refuseEnabling;

const listMock = mock(async (_tenantId: string) => ({ data: modules }));
const setMock = mock(
  async (_tenantId: string, _moduleKey: string, _enabled: boolean) => ({
    success: true as const,
  }),
);

// `./actions` is a "use server" module that reaches the server Supabase client
// and, since #1295, the service-role one; replaced outright rather than spread.
mock.module("./actions", () => ({
  listTenantModulesAction: listMock,
  setTenantModuleAction: setMock,
}));

const { TenantModulesDialog } = await import("./tenant-modules-dialog");

const TENANT: PlatformTenant = {
  id: "11111111-1111-1111-1111-111111111111",
  slug: "riverside",
  name: "Riverside Trails",
  status: "active",
  plan: "white_label",
  custom_domain: null,
  member_count: 3,
  support_grant_count: 0,
  created_at: "2026-01-01T00:00:00Z",
};

function entry(overrides: Partial<TenantModule> = {}): TenantModule {
  return {
    module_key: "constituent_accounts",
    label: "Constituent Accounts",
    description: "The signed-in area on the public website.",
    sort_order: 140,
    is_core: false,
    enabled: false,
    source: "default",
    updated_at: null,
    updated_by_email: null,
    ...overrides,
  };
}

let modules: TenantModule[] = [];

async function open() {
  renderWithToaster(
    <TenantModulesDialog
      tenant={TENANT}
      onClose={() => {}}
      onChanged={() => {}}
    />,
  );
  await waitFor(() =>
    expect(
      screen.getByRole("switch", {
        name: `Constituent Accounts for ${TENANT.name}`,
      }),
    ).toBeTruthy(),
  );
}

const moduleSwitch = () =>
  screen.getByRole("switch", {
    name: `Constituent Accounts for ${TENANT.name}`,
  });

// #1295. The operator cannot hand an organization public accounts before that
// organization has put its own terms of use in force -- the refusal names the
// document and says whose decision it is, since the operator cannot adopt it
// for them.
describe("a module its legal document is blocking", () => {
  beforeEach(() => {
    setMock.mockClear();
  });

  test("says what is missing, and will not turn on", async () => {
    modules = [entry({ blocked_reason: BLOCKED })];
    await open();

    expect(screen.getByText(BLOCKED)).toBeTruthy();
    await userEvent.click(moduleSwitch());
    expect(setMock).not.toHaveBeenCalled();
  });

  test("an unblocked module turns on as before", async () => {
    modules = [entry()];
    await open();

    expect(screen.queryByText(BLOCKED)).toBeNull();
    await userEvent.click(moduleSwitch());
    expect(setMock).toHaveBeenCalledWith(
      TENANT.id,
      "constituent_accounts",
      true,
    );
  });
});
