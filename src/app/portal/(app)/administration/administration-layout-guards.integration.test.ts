// Integration test: exercises the six Administration route guards
// (`administration/layout.tsx` and its five section layouts) against a real
// local Supabase stack, so the real my_permissions() RPC and the seeded
// role_permissions matrix decide each outcome rather than a mocked client.
// `administration/audit-log` has no actions.ts of its own (a read-only log
// view) -- this is its only integration coverage. The other four sections'
// Server Actions are covered by their own actions.integration.test.ts files;
// this file instead proves each route is actually reachable (or not) at the
// layout level, and -- for system-settings and the top-level layout --that
// the guard accepts `system_settings:manage` as an alternative to
// `administration:manage`, matching what their own actions.ts files allow.
//
// These layouts guard with requirePermission()/requireAnyPermission(), which
// redirect() instead of returning an { error } like a Server Action -- so
// the assertions here are "resolved and rendered children" vs. "redirected
// to /portal/home". A layout is just an async function, so it can be called
// directly with next/navigation's redirect mocked (the same technique
// report-layout-guards.integration.test.ts uses).
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SEEDED_USERS, signIn } from "../../../../../test/integration-setup";

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

const { default: AdministrationLayout } = await import("./layout");
const { default: UsersLayout } = await import("./users/layout");
const { default: RolesLayout } = await import("./roles/layout");
const { default: PermissionsLayout } = await import("./permissions/layout");
const { default: SystemSettingsLayout } =
  await import("./system-settings/layout");
const { default: AuditLogLayout } = await import("./audit-log/layout");

type Layout = (props: { children: ReactNode }) => Promise<ReactNode>;

const CHILDREN = "administration page content";

afterEach(() => {
  redirectMock.mockClear();
});

async function renderAs(layout: Layout, email: string) {
  currentSupabase = await signIn(email);
  try {
    const rendered = await layout({ children: CHILDREN });
    return { redirected: false as const, rendered };
  } catch (error) {
    if (!(error instanceof RedirectError)) throw error;
    return { redirected: true as const, path: error.path };
  }
}

async function expectAllowed(layout: Layout, email: string) {
  const result = await renderAs(layout, email);
  expect(result).toEqual({ redirected: false, rendered: CHILDREN });
  expect(redirectMock).not.toHaveBeenCalled();
}

async function expectDenied(layout: Layout, email: string) {
  const result = await renderAs(layout, email);
  expect(result).toEqual({ redirected: true, path: "/portal/home" });
  expect(redirectMock).toHaveBeenCalledWith("/portal/home");
}

// users/roles/permissions/audit-log all guard on administration:manage
// alone, per their layout.tsx files -- only the admin role holds that.
describe.each([
  ["administration/users", () => UsersLayout],
  ["administration/roles", () => RolesLayout],
  ["administration/permissions", () => PermissionsLayout],
  ["administration/audit-log", () => AuditLogLayout],
])("%s layout guard (integration)", (_name, getLayout) => {
  test("admin (administration manage) renders the page", async () => {
    await expectAllowed(getLayout(), SEEDED_USERS.admin);
  });

  test("board (governance manage, no administration) is redirected to /portal/home", async () => {
    await expectDenied(getLayout(), SEEDED_USERS.board);
  });

  test("event coordinator is redirected to /portal/home", async () => {
    await expectDenied(getLayout(), SEEDED_USERS.coordinator);
  });

  test("finance is redirected to /portal/home", async () => {
    await expectDenied(getLayout(), SEEDED_USERS.finance);
  });

  test("volunteer is redirected to /portal/home", async () => {
    await expectDenied(getLayout(), SEEDED_USERS.volunteer);
  });

  test("a signed-in user with no role is redirected to /portal/home", async () => {
    await expectDenied(getLayout(), SEEDED_USERS.noAccess);
  });

  test("a deactivated (former) admin is redirected to /portal/home", async () => {
    await expectDenied(getLayout(), SEEDED_USERS.former);
  });
});

// administration/layout.tsx and system-settings/layout.tsx both accept
// system_settings:manage as an alternative to administration:manage, so
// board (which holds the former but not the latter) must get through too --
// unlike the four resources above.
describe.each([
  ["administration (top-level)", () => AdministrationLayout],
  ["administration/system-settings", () => SystemSettingsLayout],
])("%s layout guard (integration)", (_name, getLayout) => {
  test("admin (administration manage) renders the page", async () => {
    await expectAllowed(getLayout(), SEEDED_USERS.admin);
  });

  test("board (system_settings manage) renders the page", async () => {
    await expectAllowed(getLayout(), SEEDED_USERS.board);
  });

  test("event coordinator is redirected to /portal/home", async () => {
    await expectDenied(getLayout(), SEEDED_USERS.coordinator);
  });

  test("finance is redirected to /portal/home", async () => {
    await expectDenied(getLayout(), SEEDED_USERS.finance);
  });

  test("volunteer is redirected to /portal/home", async () => {
    await expectDenied(getLayout(), SEEDED_USERS.volunteer);
  });

  test("a signed-in user with no role is redirected to /portal/home", async () => {
    await expectDenied(getLayout(), SEEDED_USERS.noAccess);
  });

  test("a deactivated (former) admin is redirected to /portal/home", async () => {
    await expectDenied(getLayout(), SEEDED_USERS.former);
  });
});
