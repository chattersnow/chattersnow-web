// Integration coverage for tenant identity (#707 Phase 1): my_tenant_ids(),
// current_tenant_id(), set_current_tenant(), ensure_tenant_membership(), and
// the RLS on the three tables behind them, against a real local Supabase
// stack.
//
// These are the functions every RLS policy in the schema will call from Phase
// 3 onward, and the guards here -- an expired support grant stops counting, a
// tenant admin cannot mint one, a stale selection cannot outlive its
// membership -- are the whole security argument for the model. None of them
// are observable through a mocked client.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  SEEDED_USERS,
  serviceRoleClient,
  signInAs,
} from "../../../test/integration-setup";
import { SEEDED_USER_IDS } from "../../../test/seed-fixtures";

const service = serviceRoleClient();

let chatterTenantId: string;
let secondTenantId: string;

beforeAll(async () => {
  // By age, not by slug: 20260905190000 takes the slug from
  // app.initial_tenant_slug, so a developer who has set it would otherwise
  // fail this whole file in setup.
  const { data: initial, error: initialError } = await service
    .from("tenants")
    .select("id")
    .order("created_at")
    .limit(1)
    .single();
  if (initialError) throw initialError;
  chatterTenantId = initial.id as string;

  // `tenants` has no insert policy for authenticated at all -- provisioning is
  // a platform operation -- so even the seeded admin cannot create this.
  const { data, error } = await service
    .from("tenants")
    .insert({
      name: "Integration Test Org",
      slug: `it-${crypto.randomUUID().slice(0, 8)}`,
      plan: "white_label",
    })
    .select("id")
    .single();
  if (error) throw error;
  secondTenantId = data.id as string;
});

// Cascades to its memberships and to any user_tenant_selection pointing at it.
afterAll(async () => {
  await service.from("tenants").delete().eq("id", secondTenantId);
});

describe("tenant identity", () => {
  test("a single membership needs no selection", async () => {
    const finance = await signInAs(SEEDED_USERS.finance);
    const { data, error } = await finance.rpc("current_tenant_id");
    expect(error).toBeNull();
    expect(data).toBe(chatterTenantId);
  });

  test("a tenant you are not a member of is invisible", async () => {
    const finance = await signInAs(SEEDED_USERS.finance);
    const { data } = await finance.from("tenants").select("id");
    expect((data ?? []).map((row) => row.id)).toEqual([chatterTenantId]);
  });

  test("provisioning a tenant is refused even to an admin", async () => {
    const admin = await signInAs(SEEDED_USERS.admin);
    const { error } = await admin
      .from("tenants")
      .insert({ name: "Should Not Exist", slug: "should-not-exist" });
    expect(error).not.toBeNull();
  });

  test("an admin cannot mint a platform support grant", async () => {
    // The one privilege escalation this model has to refuse: a support grant
    // is how platform staff reach a customer's data, so a customer's own admin
    // must not be able to create one.
    const admin = await signInAs(SEEDED_USERS.admin);
    const { error } = await admin.from("tenant_memberships").insert({
      user_id: SEEDED_USER_IDS.noAccess,
      tenant_id: chatterTenantId,
      kind: "support",
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      reason: "integration test",
    });
    expect(error).not.toBeNull();
  });

  test("an admin manages member rows in the tenant they are looking at", async () => {
    // Phase 2 (20260906030000): has_permission() answers for the current
    // tenant, so pairing it with tenant_id = current_tenant_id() now means
    // what it looks like. A throwaway account keeps this from touching the
    // seeded memberships the rest of the suite relies on.
    const { data: created, error: createError } =
      await service.auth.admin.createUser({
        email: `it-member-${crypto.randomUUID().slice(0, 8)}@example.test`,
        password: "password123",
        email_confirm: true,
      });
    if (createError) throw createError;
    const userId = created.user.id;

    try {
      const admin = await signInAs(SEEDED_USERS.admin);

      const inserted = await admin.from("tenant_memberships").insert({
        user_id: userId,
        tenant_id: chatterTenantId,
        kind: "member",
      });
      expect(inserted.error).toBeNull();

      // Not in a tenant they are not looking at, even one they belong to.
      const elsewhere = await admin.from("tenant_memberships").insert({
        user_id: userId,
        tenant_id: secondTenantId,
        kind: "member",
      });
      expect(elsewhere.error).not.toBeNull();

      const { error: deleteError, count } = await admin
        .from("tenant_memberships")
        .delete({ count: "exact" })
        .eq("user_id", userId)
        .eq("tenant_id", chatterTenantId);
      expect(deleteError).toBeNull();
      expect(count).toBe(1);
    } finally {
      await service.auth.admin.deleteUser(userId);
    }
  });

  test("an admin can rename their own tenant and no other", async () => {
    const admin = await signInAs(SEEDED_USERS.admin);
    const { data: before } = await service
      .from("tenants")
      .select("name")
      .eq("id", chatterTenantId)
      .single();

    try {
      const own = await admin
        .from("tenants")
        .update({ name: "Renamed By Admin" }, { count: "exact" })
        .eq("id", chatterTenantId);
      expect(own.error).toBeNull();
      expect(own.count).toBe(1);

      const other = await admin
        .from("tenants")
        .update({ name: "Renamed By Admin" }, { count: "exact" })
        .eq("id", secondTenantId);
      expect(other.error ?? other.count).not.toBe(null);
      expect(other.count ?? 0).toBe(0);

      // The column grant is what limits an admin to the name.
      const slug = await admin
        .from("tenants")
        .update({ slug: "renamed-by-admin" })
        .eq("id", chatterTenantId);
      expect(slug.error).not.toBeNull();
    } finally {
      await service
        .from("tenants")
        .update({ name: before?.name as string })
        .eq("id", chatterTenantId);
    }
  });

  test("a support grant without an expiry or a reason is rejected outright", async () => {
    const noExpiry = await service.from("tenant_memberships").insert({
      user_id: SEEDED_USER_IDS.noAccess,
      tenant_id: secondTenantId,
      kind: "support",
      reason: "no expiry",
    });
    expect(noExpiry.error).not.toBeNull();

    const noReason = await service.from("tenant_memberships").insert({
      user_id: SEEDED_USER_IDS.noAccess,
      tenant_id: secondTenantId,
      kind: "support",
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(noReason.error).not.toBeNull();
  });

  test("an ordinary membership cannot carry an expiry", async () => {
    // Otherwise "time-boxed" would be a property of some memberships rather
    // than the thing that distinguishes a support grant from a member.
    const { error } = await service.from("tenant_memberships").insert({
      user_id: SEEDED_USER_IDS.noAccess,
      tenant_id: secondTenantId,
      kind: "member",
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    });
    expect(error).not.toBeNull();
  });

  test("someone else's membership is not readable without administration:manage", async () => {
    const volunteer = await signInAs(SEEDED_USERS.volunteer);
    const { data } = await volunteer.from("tenant_memberships").select("id");
    expect(data).toHaveLength(1);
  });
});

describe("a support grant", () => {
  afterAll(async () => {
    await service
      .from("tenant_memberships")
      .delete()
      .eq("user_id", SEEDED_USER_IDS.board)
      .eq("tenant_id", secondTenantId);
  });

  test("stops counting the moment it expires", async () => {
    const board = await signInAs(SEEDED_USERS.board);

    const { error } = await service.from("tenant_memberships").insert({
      user_id: SEEDED_USER_IDS.board,
      tenant_id: secondTenantId,
      kind: "support",
      expires_at: new Date(Date.now() - 1_000).toISOString(),
      reason: "expired support session",
    });
    expect(error).toBeNull();

    // Expired, so it is not a membership at all: the tenant stays invisible
    // and the account is still a single-tenant user.
    const { data: tenants } = await board.from("tenants").select("id");
    expect((tenants ?? []).map((row) => row.id)).toEqual([chatterTenantId]);

    const { data: current } = await board.rpc("current_tenant_id");
    expect(current).toBe(chatterTenantId);
  });

  test("grants access while it is live", async () => {
    const board = await signInAs(SEEDED_USERS.board);

    const { error } = await service
      .from("tenant_memberships")
      .update({ expires_at: new Date(Date.now() + 3_600_000).toISOString() })
      .eq("user_id", SEEDED_USER_IDS.board)
      .eq("tenant_id", secondTenantId);
    expect(error).toBeNull();

    const { data: tenants } = await board.from("tenants").select("id");
    expect((tenants ?? []).map((row) => row.id).sort()).toEqual(
      [chatterTenantId, secondTenantId].sort(),
    );
  });
});

describe("a user in more than one tenant", () => {
  beforeAll(async () => {
    const { error } = await service.from("tenant_memberships").insert({
      user_id: SEEDED_USER_IDS.multi,
      tenant_id: secondTenantId,
      kind: "member",
    });
    if (error) throw error;
  });

  test("gets no tenant until they pick one", async () => {
    // current_tenant_id() deliberately returns null rather than guessing:
    // from Phase 2 it decides which organisation's rows a query returns, and
    // a wrong guess there is a cross-tenant read.
    const multi = await signInAs(SEEDED_USERS.multi);
    const { data } = await multi.rpc("current_tenant_id");
    expect(data).toBeNull();
  });

  test("sees both tenants", async () => {
    const multi = await signInAs(SEEDED_USERS.multi);
    const { data } = await multi.from("tenants").select("id");
    expect((data ?? []).map((row) => row.id).sort()).toEqual(
      [chatterTenantId, secondTenantId].sort(),
    );
  });

  test("switches by choosing one", async () => {
    const multi = await signInAs(SEEDED_USERS.multi);

    const { error } = await multi.rpc("set_current_tenant", {
      p_tenant_id: secondTenantId,
    });
    expect(error).toBeNull();

    const { data } = await multi.rpc("current_tenant_id");
    expect(data).toBe(secondTenantId);
  });

  test("cannot switch to a tenant they are not in", async () => {
    const finance = await signInAs(SEEDED_USERS.finance);
    const { error } = await finance.rpc("set_current_tenant", {
      p_tenant_id: secondTenantId,
    });
    expect(error).not.toBeNull();
  });

  test("cannot write the selection directly, bypassing the membership check", async () => {
    // user_tenant_selection has no insert or update policy, and no write
    // grant: set_current_tenant() is the only way in, which is what makes the
    // membership check unskippable.
    const finance = await signInAs(SEEDED_USERS.finance);
    const { error } = await finance.from("user_tenant_selection").insert({
      user_id: SEEDED_USER_IDS.finance,
      tenant_id: secondTenantId,
    });
    expect(error).not.toBeNull();
  });

  test("falls back when the selected membership is revoked", async () => {
    // The selection row survives -- nothing deletes it -- so a stale pointer
    // at a tenant the user was removed from must not keep resolving to it.
    const multi = await signInAs(SEEDED_USERS.multi);

    const { error } = await service
      .from("tenant_memberships")
      .delete()
      .eq("user_id", SEEDED_USER_IDS.multi)
      .eq("tenant_id", secondTenantId);
    expect(error).toBeNull();

    const { data: stillSelected } = await service
      .from("user_tenant_selection")
      .select("tenant_id")
      .eq("user_id", SEEDED_USER_IDS.multi)
      .single();
    expect(stillSelected?.tenant_id).toBe(secondTenantId);

    const { data } = await multi.rpc("current_tenant_id");
    expect(data).toBe(chatterTenantId);
  });
});

describe("ensure_tenant_membership", () => {
  afterAll(async () => {
    await service
      .from("tenants")
      .update({ status: "active" })
      .in("id", [secondTenantId, chatterTenantId]);
    // Restores what seed.sql gave this account. The last test may already have
    // re-created it, hence upsert rather than insert.
    await service.from("tenant_memberships").upsert(
      {
        user_id: SEEDED_USER_IDS.noAccess,
        tenant_id: chatterTenantId,
        kind: "member",
      },
      { onConflict: "user_id,tenant_id", ignoreDuplicates: true },
    );
  });

  test("does not auto-join anyone once a second tenant exists", async () => {
    // This is the guard that keeps the single-tenant stopgap safe: a stray
    // signup on a multi-tenant database must not land inside somebody else's
    // organisation. Phase 3 replaces the fallback with host resolution.
    const noAccess = await signInAs(SEEDED_USERS.noAccess);
    await service
      .from("tenant_memberships")
      .delete()
      .eq("user_id", SEEDED_USER_IDS.noAccess);

    const { data, error } = await noAccess.rpc("ensure_tenant_membership");
    expect(error).toBeNull();
    expect(data).toBeNull();

    const { data: memberships } = await service
      .from("tenant_memberships")
      .select("id")
      .eq("user_id", SEEDED_USER_IDS.noAccess);
    expect(memberships).toHaveLength(0);
  });

  test("joins the sole active tenant when there is exactly one", async () => {
    const noAccess = await signInAs(SEEDED_USERS.noAccess);
    await service
      .from("tenants")
      .update({ status: "archived" })
      .eq("id", secondTenantId);

    const { data, error } = await noAccess.rpc("ensure_tenant_membership");
    expect(error).toBeNull();
    expect(data).toBe(chatterTenantId);
  });

  test("does not move a member of a suspended tenant into the active one", async () => {
    // The guard has to read the raw membership table, not my_tenant_ids():
    // that view filters to live memberships in *active* tenants, so a member
    // of a suspended tenant looks membership-less. Checking the filtered view
    // meant suspending a tenant handed every one of its users a permanent
    // membership in whichever other tenant happened to be the only active one.
    await service
      .from("tenants")
      .update({ status: "active" })
      .eq("id", secondTenantId);
    await service
      .from("tenants")
      .update({ status: "suspended" })
      .eq("id", chatterTenantId);

    const finance = await signInAs(SEEDED_USERS.finance);
    const { data, error } = await finance.rpc("ensure_tenant_membership");
    expect(error).toBeNull();
    expect(data).toBeNull();

    const { data: leaked } = await service
      .from("tenant_memberships")
      .select("id")
      .eq("user_id", SEEDED_USER_IDS.finance)
      .eq("tenant_id", secondTenantId);
    expect(leaked).toHaveLength(0);

    await service
      .from("tenants")
      .update({ status: "active" })
      .eq("id", chatterTenantId);
  });
});
