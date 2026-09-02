// Integration test: exercises the three report-page permission gates
// (finance, inventory, programs) against a real local Supabase stack, so the
// real my_permissions() RPC and the seeded role_permissions matrix decide
// each outcome rather than a mocked client.
//
// These layouts guard with requirePermission(), which redirect()s instead of
// returning an { error } like the Server Actions covered elsewhere -- so the
// assertions here are "resolved and rendered children" vs. "redirected to
// /portal/home". A layout is just an async function, so it can be called
// directly with next/navigation's redirect mocked (the same technique the
// action tests use for next/cache's revalidatePath).
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SEEDED_USERS, signIn } from "../../../../test/integration-setup";

// Next's real redirect() throws to unwind rendering, and requirePermission()
// relies on that (it has no return after the call) -- so the mock throws too,
// otherwise a denied layout would fall through and "return children" exactly
// like an allowed one, and every deny assertion would be vacuous.
class RedirectError extends Error {
  constructor(readonly path: string) {
    super(`NEXT_REDIRECT:${path}`);
  }
}
const redirectMock = mock((path: string) => {
  throw new RedirectError(path);
});
mock.module("next/navigation", () => ({ redirect: redirectMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { default: FinanceReportsLayout } =
  await import("./finance/reports/layout");
const { default: InventoryReportsLayout } =
  await import("./inventory/reports/layout");
const { default: ProgramImpactReportsLayout } =
  await import("./programs/reports/layout");

type ReportLayout = (props: { children: ReactNode }) => Promise<ReactNode>;

const CHILDREN = "report page content";

afterEach(() => {
  redirectMock.mockClear();
});

// Signs in as `email`, renders `layout`, and reports whether the guard let it
// through -- the two shapes every test below asserts on.
async function renderAs(layout: ReportLayout, email: string) {
  currentSupabase = await signIn(email);
  try {
    const rendered = await layout({ children: CHILDREN });
    return { redirected: false as const, rendered };
  } catch (error) {
    if (!(error instanceof RedirectError)) throw error;
    return { redirected: true as const, path: error.path };
  }
}

async function expectAllowed(layout: ReportLayout, email: string) {
  const result = await renderAs(layout, email);
  expect(result).toEqual({ redirected: false, rendered: CHILDREN });
  expect(redirectMock).not.toHaveBeenCalled();
}

async function expectDenied(layout: ReportLayout, email: string) {
  const result = await renderAs(layout, email);
  expect(result).toEqual({ redirected: true, path: "/portal/home" });
  expect(redirectMock).toHaveBeenCalledWith("/portal/home");
}

// Per the entitlement matrix in
// 20260822090000_create_resources_and_role_permissions.sql and
// 20260825020000_add_programs_reports_resource.sql:
//
//   finance_reports    admin manage | finance view | board view | others none
//   inventory_reports  admin manage | finance view | others none
//   programs_reports   admin manage | coordinator manage | finance view |
//                      board view | volunteer none
describe("finance/reports layout guard (integration)", () => {
  test("admin (manage) renders the page", async () => {
    await expectAllowed(FinanceReportsLayout, SEEDED_USERS.admin);
  });

  test("finance (view) renders the page", async () => {
    await expectAllowed(FinanceReportsLayout, SEEDED_USERS.finance);
  });

  test("board (view) renders the page", async () => {
    await expectAllowed(FinanceReportsLayout, SEEDED_USERS.board);
  });

  test("event coordinator is redirected to /portal/home", async () => {
    await expectDenied(FinanceReportsLayout, SEEDED_USERS.coordinator);
  });

  test("volunteer is redirected to /portal/home", async () => {
    await expectDenied(FinanceReportsLayout, SEEDED_USERS.volunteer);
  });

  test("a signed-in user with no role is redirected to /portal/home", async () => {
    await expectDenied(FinanceReportsLayout, SEEDED_USERS.noAccess);
  });
});

describe("inventory/reports layout guard (integration)", () => {
  test("admin (manage) renders the page", async () => {
    await expectAllowed(InventoryReportsLayout, SEEDED_USERS.admin);
  });

  test("finance (view) renders the page", async () => {
    await expectAllowed(InventoryReportsLayout, SEEDED_USERS.finance);
  });

  // inventory_reports:view is a distinct grant from inventory:manage -- board
  // and the coordinator hold neither, and the coordinator's events/inventory
  // adjacency must not leak into the valuation report.
  test("event coordinator is redirected to /portal/home", async () => {
    await expectDenied(InventoryReportsLayout, SEEDED_USERS.coordinator);
  });

  test("board is redirected to /portal/home", async () => {
    await expectDenied(InventoryReportsLayout, SEEDED_USERS.board);
  });

  test("volunteer is redirected to /portal/home", async () => {
    await expectDenied(InventoryReportsLayout, SEEDED_USERS.volunteer);
  });

  test("a signed-in user with no role is redirected to /portal/home", async () => {
    await expectDenied(InventoryReportsLayout, SEEDED_USERS.noAccess);
  });
});

describe("programs/reports layout guard (integration)", () => {
  test("admin (manage) renders the page", async () => {
    await expectAllowed(ProgramImpactReportsLayout, SEEDED_USERS.admin);
  });

  test("event coordinator (manage) renders the page", async () => {
    await expectAllowed(ProgramImpactReportsLayout, SEEDED_USERS.coordinator);
  });

  test("finance (view) renders the page", async () => {
    await expectAllowed(ProgramImpactReportsLayout, SEEDED_USERS.finance);
  });

  test("board (view) renders the page", async () => {
    await expectAllowed(ProgramImpactReportsLayout, SEEDED_USERS.board);
  });

  test("volunteer is redirected to /portal/home", async () => {
    await expectDenied(ProgramImpactReportsLayout, SEEDED_USERS.volunteer);
  });

  test("a signed-in user with no role is redirected to /portal/home", async () => {
    await expectDenied(ProgramImpactReportsLayout, SEEDED_USERS.noAccess);
  });

  // A deactivated account keeps its user_roles row; both my_permissions() and
  // has_permission() must still zero it out, so the coordinator-level grant
  // above must not survive deactivation at the route guard.
  test("a deactivated coordinator is redirected to /portal/home", async () => {
    await expectDenied(ProgramImpactReportsLayout, SEEDED_USERS.former);
  });
});
