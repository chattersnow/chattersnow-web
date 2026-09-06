// Integration test: exercises switchTenantAction against a real local
// Supabase stack.
//
// The action itself is deliberately thin -- it holds no permission check and
// forwards straight to set_current_tenant() (20260905180000), on the argument
// that the RPC refuses any tenant the caller has no live membership in. That
// argument is the whole security boundary of the switcher, and nothing proved
// it: a mocked client would happily "switch" to a forged id. This file proves
// the refusal happens at the database, that a refused switch leaves the
// caller's existing selection untouched, and that the error the dialog shows
// never reveals whether the tenant exists.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  anonClient,
  serviceRoleClient,
  signInAs,
} from "../../../../test/integration-setup";
import { SEEDED_USER_IDS } from "../../../../test/seed-fixtures";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { switchTenantAction } = await import("./tenant-switcher-actions");

const service = serviceRoleClient();

const REFUSED = { error: "You no longer have access to that account." };

let homeTenantId: string;
let foreignTenantId: string;

beforeAll(async () => {
  // By age, not by slug: 20260905190000 takes the slug from
  // app.initial_tenant_slug, so a developer who has set one would otherwise
  // fail this whole file in setup.
  const { data: initial, error: initialError } = await service
    .from("tenants")
    .select("id")
    .order("created_at")
    .limit(1)
    .single();
  if (initialError) throw initialError;
  homeTenantId = initial.id as string;

  // `tenants` has no insert policy for authenticated at all -- provisioning
  // is a platform operation -- so this fixture needs the service role.
  const { data, error } = await service
    .from("tenants")
    .insert({
      name: "Integration Test Foreign Org",
      slug: `it-switch-${crypto.randomUUID().slice(0, 8)}`,
      plan: "white_label",
    })
    .select("id")
    .single();
  if (error) throw error;
  foreignTenantId = data.id as string;
});

// Cascades to its memberships and to any user_tenant_selection pointing at it.
afterAll(async () => {
  await service.from("tenants").delete().eq("id", foreignTenantId);
});

afterEach(() => {
  revalidatePathMock.mockClear();
});

// Read through the service role rather than the signed-in client:
// `user_tenant_selection` grants only `select` to authenticated, and the row
// this asserts on is written by set_current_tenant()'s definer rights.
// Keyed off the fixed seed ids rather than a GoTrue admin lookup, which
// keeps this file working without the service-role auth admin API.
async function selectionFor(userId: string) {
  const { data } = await service
    .from("user_tenant_selection")
    .select("tenant_id")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.tenant_id as string | undefined) ?? null;
}

describe("switchTenantAction (integration)", () => {
  test("switching to a tenant you belong to is accepted and recorded", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await switchTenantAction(homeTenantId)).toBeNull();
    expect(await selectionFor(SEEDED_USER_IDS.admin)).toBe(homeTenantId);
  });

  test("a tenant the caller has no membership in is refused by the database", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    await switchTenantAction(homeTenantId);

    // The foreign tenant exists and the id is well-formed -- the only thing
    // standing between the caller and another organisation's data is
    // set_current_tenant()'s my_tenant_ids() check.
    expect(await switchTenantAction(foreignTenantId)).toEqual(REFUSED);

    // The refusal must not have moved the caller off their own tenant.
    expect(await selectionFor(SEEDED_USER_IDS.admin)).toBe(homeTenantId);
  });

  test("a forged tenant id is refused the same way an existing one is", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.finance);

    const forged = await switchTenantAction(crypto.randomUUID());
    expect(forged).toEqual(REFUSED);

    // Identical wording for "exists but not yours" and "does not exist", so
    // the dialog can't be used to enumerate which tenants are real.
    currentSupabase = await signInAs(SEEDED_USERS.finance);
    expect(await switchTenantAction(foreignTenantId)).toEqual(forged);
  });

  test("an unauthenticated caller cannot set a selection", async () => {
    // set_current_tenant() is granted to `authenticated` only, and auth.uid()
    // is null for anon, so this fails at the grant rather than the membership
    // check -- but it must still come back as a message, not a throw.
    currentSupabase = anonClient();

    expect(await switchTenantAction(homeTenantId)).toEqual(REFUSED);
  });

  test("a role with no portal permissions still cannot reach a foreign tenant", async () => {
    // noAccess holds a membership in the home tenant but no resource
    // permissions; the switcher is not permission-gated, so this proves the
    // membership check alone is what confines them.
    currentSupabase = await signInAs(SEEDED_USERS.noAccess);

    expect(await switchTenantAction(foreignTenantId)).toEqual(REFUSED);
    expect(await selectionFor(SEEDED_USER_IDS.noAccess)).not.toBe(
      foreignTenantId,
    );
  });

  test("revalidates the whole portal layout on a successful switch", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    await switchTenantAction(homeTenantId);

    expect(revalidatePathMock).toHaveBeenCalledWith("/portal", "layout");
  });

  test("does not revalidate when the switch was refused", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    await switchTenantAction(foreignTenantId);

    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
