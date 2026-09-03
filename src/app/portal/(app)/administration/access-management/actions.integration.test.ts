// Integration test: exercises the real Access Management Server Actions
// (checkPermission/checkAnyPermission, then the real services/assets/
// access_grants RLS and unique-active-grant constraint) against a real
// local Supabase stack. Requires `bun run db:start && bun run db:reset`
// first; run via `bun run test:integration`. Not picked up by `bun run
// test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createPerson,
  signIn,
  signInAs,
} from "../../../../../../test/integration-setup";
import { getAccessManagementAttentionSummary } from "@/lib/portal/attention-items";
import { computeNextReviewDate } from "@/lib/portal/access-management/review-cadence";
import {
  getAssetDetail,
  listAccessGrantsForAsset,
  listAssets,
} from "./queries";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  createServiceAction,
  createAssetAction,
  updateAssetAction,
  reviewAssetAction,
  createAccessGrantAction,
  updateAccessGrantAction,
  verifyAccessGrantAction,
  revokeAccessGrantAction,
  deleteAccessGrantAction,
} = await import("./actions");

const DENIED = { error: "You don't have permission to perform this action." };

afterEach(() => {
  revalidatePathMock.mockClear();
});

async function createTestService(name = `IT Service ${crypto.randomUUID()}`) {
  const { data, error } = await adminClient
    .from("services")
    .insert({ name })
    .select("id")
    .single();
  if (error) throw error;
  const id = data.id as string;
  return {
    id,
    name,
    async cleanup() {
      await adminClient.from("services").delete().eq("id", id);
    },
  };
}

async function createTestAsset(
  serviceId: string,
  overrides: { sensitivity?: string; mfa_status?: string; name?: string } = {},
) {
  const { data, error } = await adminClient
    .from("assets")
    .insert({
      name: overrides.name ?? `IT Asset ${crypto.randomUUID()}`,
      service_id: serviceId,
      category: "hosting",
      sensitivity: overrides.sensitivity ?? "medium",
      mfa_status: overrides.mfa_status ?? "unknown",
    })
    .select("id")
    .single();
  if (error) throw error;
  const id = data.id as string;
  return {
    id,
    async cleanup() {
      await adminClient.from("assets").delete().eq("id", id);
    },
  };
}

function assetFormData(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  const defaults: Record<string, string> = {
    name: `IT Asset ${crypto.randomUUID()}`,
    category: "hosting",
    status: "active",
    sensitivity: "medium",
    mfa_status: "unknown",
    credential_management_location: "unknown",
  };
  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    formData.set(key, value);
  }
  return formData;
}

function grantFormData(
  personId: string,
  overrides: Record<string, string> = {},
) {
  const formData = new FormData();
  formData.set("person_id", personId);
  formData.set("access_level", overrides.access_level ?? "viewer");
  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }
  return formData;
}

const ROLES_WITHOUT_ACCESS_MANAGEMENT = [
  ["event_coordinator", SEEDED_USERS.coordinator],
  ["finance", SEEDED_USERS.finance],
  ["board", SEEDED_USERS.board],
  ["volunteer", SEEDED_USERS.volunteer],
  ["no-role", SEEDED_USERS.noAccess],
  ["deactivated (former)", SEEDED_USERS.former],
] as const;

describe("access-management services actions (integration)", () => {
  test("requires access_management_assets:manage to create a service", async () => {
    currentSupabase = anonClient();
    expect(
      await createServiceAction(`Anon Service ${crypto.randomUUID()}`, "", ""),
    ).toEqual(DENIED);
  });

  test("validates the service name before checking permission", async () => {
    currentSupabase = anonClient();
    expect(await createServiceAction("", "", "")).toEqual({
      error: "Service name is required.",
    });
  });

  test("admin can create a service; duplicate name is rejected", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const name = `IT Service ${crypto.randomUUID()}`;
    const result = await createServiceAction(name, "https://example.test", "");
    if ("error" in result) throw new Error(result.error);
    expect(result.service.name).toBe(name);

    expect(await createServiceAction(name, "", "")).toEqual({
      error: "A service with that name already exists.",
    });

    await adminClient.from("services").delete().eq("id", result.service.id);
  });

  test("rejects a website that doesn't start with http(s)://", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    expect(
      await createServiceAction(
        `IT Service ${crypto.randomUUID()}`,
        "not-a-url",
        "",
      ),
    ).toEqual({ error: "Website must start with http:// or https://." });
  });
});

describe("access-management assets actions (integration)", () => {
  test("requires access_management_assets:manage to create or update an asset", async () => {
    const service = await createTestService();
    currentSupabase = anonClient();

    expect(
      await createAssetAction(assetFormData({ service_id: service.id })),
    ).toEqual(DENIED);

    const asset = await createTestAsset(service.id);
    expect(
      await updateAssetAction(
        asset.id,
        assetFormData({ service_id: service.id }),
      ),
    ).toEqual(DENIED);

    await asset.cleanup();
    await service.cleanup();
  });

  test("admin can create and update an asset", async () => {
    const service = await createTestService();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    const created = await createAssetAction(
      assetFormData({ service_id: service.id, name: "IT Test Asset" }),
    );
    if ("error" in created) throw new Error(created.error);

    const updated = await updateAssetAction(
      created.assetId,
      assetFormData({
        service_id: service.id,
        name: "IT Test Asset Renamed",
        sensitivity: "critical",
      }),
    );
    expect(updated).toEqual({ success: true });

    const { data: row } = await adminClient
      .from("assets")
      .select("name, sensitivity")
      .eq("id", created.assetId)
      .single();
    expect(row).toMatchObject({
      name: "IT Test Asset Renamed",
      sensitivity: "critical",
    });

    await adminClient.from("assets").delete().eq("id", created.assetId);
    await service.cleanup();
  });

  test("createAssetAction validates required fields before checking permission", async () => {
    currentSupabase = anonClient();
    expect(await createAssetAction(assetFormData({ name: "" }))).toEqual({
      error: "Asset name is required.",
    });
    expect(await createAssetAction(assetFormData({ service_id: "" }))).toEqual({
      error: "Select a service.",
    });
  });

  for (const [label, email] of ROLES_WITHOUT_ACCESS_MANAGEMENT) {
    test(`${label} account cannot create an asset`, async () => {
      const service = await createTestService();
      currentSupabase = await signInAs(email);
      expect(
        await createAssetAction(assetFormData({ service_id: service.id })),
      ).toEqual(DENIED);
      await service.cleanup();
    });
  }

  test("reviewAssetAction sets last_reviewed to today and next_review per the sensitivity cadence", async () => {
    const service = await createTestService();
    const asset = await createTestAsset(service.id, {
      sensitivity: "critical",
    });
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    const result = await reviewAssetAction(asset.id, "critical");
    if ("error" in result) throw new Error(result.error);
    expect(result.nextReview).toBe(computeNextReviewDate("critical"));

    const { data: row } = await adminClient
      .from("assets")
      .select("last_reviewed, next_review")
      .eq("id", asset.id)
      .single();
    expect(row?.last_reviewed).toBe(new Date().toISOString().slice(0, 10));
    expect(row?.next_review).toBe(result.nextReview);

    await asset.cleanup();
    await service.cleanup();
  });

  test("a role granted only access_management_reviews:manage can review an asset but not create one", async () => {
    const service = await createTestService();
    const asset = await createTestAsset(service.id);

    const { data: boardRole } = await adminClient
      .from("roles")
      .select("id")
      .eq("name", "board")
      .single();
    const { data: reviewsResource } = await adminClient
      .from("resources")
      .select("id")
      .eq("key", "access_management_reviews")
      .single();
    if (!boardRole || !reviewsResource) {
      throw new Error(
        "expected the board role and access_management_reviews resource",
      );
    }

    const { error: grantError } = await adminClient
      .from("role_permissions")
      .upsert(
        {
          role_id: boardRole.id,
          resource_id: reviewsResource.id,
          level: "manage",
        },
        { onConflict: "role_id,resource_id" },
      );
    if (grantError) throw grantError;

    try {
      // A fresh sign-in rather than the memoised signInAs() client: permissions
      // are resolved once per Supabase client (getCurrentUserPermissions), so
      // the shared board client would still answer with the matrix it saw
      // before the grant above. A new client is what a new request gets.
      currentSupabase = await signIn(SEEDED_USERS.board);
      expect(await reviewAssetAction(asset.id, "medium")).toEqual({
        success: true,
        nextReview: computeNextReviewDate("medium"),
      });
      expect(
        await createAssetAction(assetFormData({ service_id: service.id })),
      ).toEqual(DENIED);
    } finally {
      await adminClient
        .from("role_permissions")
        .update({ level: "none" })
        .eq("role_id", boardRole.id)
        .eq("resource_id", reviewsResource.id);
    }

    await asset.cleanup();
    await service.cleanup();
  });
});

describe("access-management access_grants actions (integration)", () => {
  test("requires access_management_assets:manage to create, update, revoke or delete a grant", async () => {
    const service = await createTestService();
    const asset = await createTestAsset(service.id);
    const person = await createPerson();
    currentSupabase = anonClient();

    expect(
      await createAccessGrantAction(asset.id, grantFormData(person.id)),
    ).toEqual(DENIED);

    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const created = await createAccessGrantAction(
      asset.id,
      grantFormData(person.id),
    );
    expect(created).toEqual({ success: true });
    const { data: grant } = await adminClient
      .from("access_grants")
      .select("id")
      .eq("asset_id", asset.id)
      .eq("person_id", person.id)
      .single();
    if (!grant) throw new Error("expected the created grant");

    currentSupabase = anonClient();
    expect(
      await updateAccessGrantAction(
        grant.id as string,
        asset.id,
        grantFormData(person.id, { access_level: "admin" }),
      ),
    ).toEqual(DENIED);
    expect(await revokeAccessGrantAction(grant.id as string, asset.id)).toEqual(
      DENIED,
    );
    expect(await deleteAccessGrantAction(grant.id as string, asset.id)).toEqual(
      DENIED,
    );

    await adminClient
      .from("access_grants")
      .delete()
      .eq("id", grant.id as string);
    await person.cleanup();
    await asset.cleanup();
    await service.cleanup();
  });

  test("admin can delete a grant, permanently removing the record", async () => {
    const service = await createTestService();
    const asset = await createTestAsset(service.id);
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    await createAccessGrantAction(asset.id, grantFormData(person.id));
    const { data: grant } = await adminClient
      .from("access_grants")
      .select("id")
      .eq("asset_id", asset.id)
      .eq("person_id", person.id)
      .single();
    if (!grant) throw new Error("expected the created grant");

    expect(await deleteAccessGrantAction(grant.id as string, asset.id)).toEqual(
      { success: true },
    );

    const { data: row } = await adminClient
      .from("access_grants")
      .select("id")
      .eq("id", grant.id as string)
      .maybeSingle();
    expect(row).toBeNull();

    await person.cleanup();
    await asset.cleanup();
    await service.cleanup();
  });

  test("admin can create, update, verify and revoke a grant; a duplicate active grant is rejected", async () => {
    const service = await createTestService();
    const asset = await createTestAsset(service.id);
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    const created = await createAccessGrantAction(
      asset.id,
      grantFormData(person.id, { access_level: "editor" }),
    );
    expect(created).toEqual({ success: true });

    expect(
      await createAccessGrantAction(asset.id, grantFormData(person.id)),
    ).toEqual({
      error: "This person already has an active grant on this asset.",
    });

    const { data: grant } = await adminClient
      .from("access_grants")
      .select("id, status")
      .eq("asset_id", asset.id)
      .eq("person_id", person.id)
      .single();
    if (!grant) throw new Error("expected the created grant");
    const grantId = grant.id as string;

    expect(
      await updateAccessGrantAction(
        grantId,
        asset.id,
        grantFormData(person.id, { access_level: "admin" }),
      ),
    ).toEqual({ success: true });

    expect(await verifyAccessGrantAction(grantId, asset.id)).toEqual({
      success: true,
    });

    expect(await revokeAccessGrantAction(grantId, asset.id)).toEqual({
      success: true,
    });

    const { data: row } = await adminClient
      .from("access_grants")
      .select("access_level, status, last_verified, revoked_at, revoked_by")
      .eq("id", grantId)
      .single();
    expect(row).toMatchObject({ access_level: "admin", status: "revoked" });
    expect(row?.last_verified).toBe(new Date().toISOString().slice(0, 10));
    expect(row?.revoked_at).toBe(new Date().toISOString().slice(0, 10));
    expect(row?.revoked_by).not.toBeNull();

    // Revoking freed up the active-grant slot, so re-granting the same
    // person/asset pair inserts a fresh row rather than erroring.
    expect(
      await createAccessGrantAction(asset.id, grantFormData(person.id)),
    ).toEqual({ success: true });

    await adminClient.from("access_grants").delete().eq("asset_id", asset.id);
    await person.cleanup();
    await asset.cleanup();
    await service.cleanup();
  });

  test("createAccessGrantAction validates required fields before checking permission", async () => {
    currentSupabase = anonClient();
    expect(
      await createAccessGrantAction(crypto.randomUUID(), grantFormData("")),
    ).toEqual({ error: "Select a person." });
  });
});

describe("getAccessManagementAttentionSummary (integration)", () => {
  test("flags reviews due, critical assets without MFA, and single-administrator assets", async () => {
    const service = await createTestService();
    const overdueAsset = await createTestAsset(service.id, {
      sensitivity: "medium",
    });
    const criticalNoMfaAsset = await createTestAsset(service.id, {
      sensitivity: "critical",
      mfa_status: "disabled",
    });
    const singleAdminAsset = await createTestAsset(service.id, {
      sensitivity: "high",
    });
    const person = await createPerson();

    await adminClient
      .from("assets")
      .update({ next_review: "2000-01-01" })
      .eq("id", overdueAsset.id);

    const { error: grantError } = await adminClient
      .from("access_grants")
      .insert({
        asset_id: singleAdminAsset.id,
        person_id: person.id,
        access_level: "admin",
      });
    if (grantError) throw grantError;

    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const summary = await getAccessManagementAttentionSummary(currentSupabase, {
      canSeeAccessManagement: true,
    });

    const byKey = new Map(summary.items.map((item) => [item.key, item]));
    expect(
      byKey.get("access_management_reviews_due")?.count,
    ).toBeGreaterThanOrEqual(1);
    expect(
      byKey.get("access_management_critical_no_mfa")?.count,
    ).toBeGreaterThanOrEqual(1);
    expect(
      byKey.get("access_management_single_administrator")?.count,
    ).toBeGreaterThanOrEqual(1);

    await adminClient
      .from("access_grants")
      .delete()
      .eq("asset_id", singleAdminAsset.id);
    await person.cleanup();
    await overdueAsset.cleanup();
    await criticalNoMfaAsset.cleanup();
    await singleAdminAsset.cleanup();
    await service.cleanup();
  });

  test("returns no items when the caller can't see access management", async () => {
    currentSupabase = anonClient();
    const summary = await getAccessManagementAttentionSummary(currentSupabase, {
      canSeeAccessManagement: false,
    });
    expect(summary).toEqual({ items: [] });
  });
});

// The read helpers in queries.ts embed related rows (assets.service,
// access_grants.person, and assets' four separate people FKs on
// getAssetDetail) via PostgREST's automatic foreign-key embedding -- not
// exercised anywhere else, since actions.integration.test.ts above reads
// raw rows straight off adminClient rather than through these functions.
describe("access-management read queries (integration)", () => {
  test("listAssets embeds each asset's service", async () => {
    const service = await createTestService();
    const asset = await createTestAsset(service.id, { name: "IT List Asset" });
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    const result = await listAssets(currentSupabase);
    if ("error" in result) throw new Error(result.error);
    const row = result.data.find((a) => a.id === asset.id);
    expect(row).toMatchObject({
      name: "IT List Asset",
      service: { id: service.id, name: service.name },
    });

    await asset.cleanup();
    await service.cleanup();
  });

  test("getAssetDetail embeds the service and all four people FKs", async () => {
    const service = await createTestService();
    const owner = await createPerson({ name: "IT Owner" });
    const primaryAdmin = await createPerson({ name: "IT Primary Admin" });
    const backupAdmin = await createPerson({ name: "IT Backup Admin" });
    const recoveryOwner = await createPerson({ name: "IT Recovery Owner" });
    const asset = await createTestAsset(service.id);
    const { error: updateError } = await adminClient
      .from("assets")
      .update({
        owner_person_id: owner.id,
        primary_admin_person_id: primaryAdmin.id,
        backup_admin_person_id: backupAdmin.id,
        recovery_owner_person_id: recoveryOwner.id,
      })
      .eq("id", asset.id);
    if (updateError) throw updateError;

    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const result = await getAssetDetail(currentSupabase, asset.id);
    if ("error" in result) throw new Error(result.error);
    expect(result.data).toMatchObject({
      service: { id: service.id, name: service.name },
      owner: { id: owner.id, name: "IT Owner" },
      primary_admin: { id: primaryAdmin.id, name: "IT Primary Admin" },
      backup_admin: { id: backupAdmin.id, name: "IT Backup Admin" },
      recovery_owner: { id: recoveryOwner.id, name: "IT Recovery Owner" },
    });

    await asset.cleanup();
    await owner.cleanup();
    await primaryAdmin.cleanup();
    await backupAdmin.cleanup();
    await recoveryOwner.cleanup();
    await service.cleanup();
  });

  test("getAssetDetail reports a missing asset", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const result = await getAssetDetail(currentSupabase, crypto.randomUUID());
    expect(result).toEqual({ error: "Asset not found." });
  });

  test("listAccessGrantsForAsset embeds the grant's person", async () => {
    const service = await createTestService();
    const asset = await createTestAsset(service.id);
    const person = await createPerson({ name: "IT Grant Person" });
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    const created = await createAccessGrantAction(
      asset.id,
      grantFormData(person.id, { access_level: "editor" }),
    );
    expect(created).toEqual({ success: true });

    const result = await listAccessGrantsForAsset(currentSupabase, asset.id);
    if ("error" in result) throw new Error(result.error);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      access_level: "editor",
      status: "active",
      person: { id: person.id, name: "IT Grant Person" },
    });

    await adminClient.from("access_grants").delete().eq("asset_id", asset.id);
    await person.cleanup();
    await asset.cleanup();
    await service.cleanup();
  });
});
