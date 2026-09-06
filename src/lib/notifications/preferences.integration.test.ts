// Integration coverage for the two tables behind outbound email (#488):
// person_notification_preferences and notification_deliveries, against a real
// local Supabase stack.
//
// The case worth writing this file for is the first one. The obvious
// self-scoped policy -- `person_id in (select id from people where
// auth_user_id = auth.uid())` -- looks right and silently is not: the "people
// select" policy (20260826000000) demands people:view, people_intake:manage or
// reimbursement_approvals:manage, and a subquery inside a policy is subject to
// it, so a volunteer would resolve to nothing and could never see their own
// preference. my_person_id() is security definer for exactly that reason, and
// the volunteer case below is what proves it.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  serviceRoleClient,
  signInAs,
} from "../../../test/integration-setup";
import { SEEDED_PERSON_IDS } from "../../../test/seed-fixtures";

const service = serviceRoleClient();
const anon = anonClient();

const KIND = "task_digest";

// A second person in the same tenant, for the "not mine" cases. Jamie Rivera,
// a seeded donor: a stable id, and deliberately not an account -- a preference
// row is legal for any person, but only its owner may touch it.
const OTHER_PERSON_IN_TENANT = SEEDED_PERSON_IDS.donor1;

let volunteer: SupabaseClient;
let volunteerPersonId: string;
let chatterTenantId: string;
let otherTenantId: string;
let otherPersonId: string;

beforeAll(async () => {
  const { data: tenant, error: tenantError } = await service
    .from("tenants")
    .select("id")
    .order("created_at")
    .limit(1)
    .single();
  if (tenantError) throw tenantError;
  chatterTenantId = tenant.id as string;

  // Archived, not active. This file only needs a second tenant to *exist* --
  // to own a person a cross-tenant reference can be attempted against -- and a
  // second *active* tenant would knock default_tenant_id() off its sole-tenant
  // fallback for every other integration file that shares this database.
  const { data: other, error: otherError } = await service
    .from("tenants")
    .insert({
      name: "Notification Test Org",
      slug: `notif-${crypto.randomUUID().slice(0, 8)}`,
      status: "archived",
    })
    .select("id")
    .single();
  if (otherError) throw otherError;
  otherTenantId = other.id as string;

  const { data: otherPerson, error: otherPersonError } = await service
    .from("people")
    .insert({
      tenant_id: otherTenantId,
      name: "Other Tenant Person",
      source_type: "individual",
    })
    .select("id")
    .single();
  if (otherPersonError) throw otherPersonError;
  otherPersonId = otherPerson.id as string;

  // The seeded volunteer account has no people row until something makes one.
  // ensure_current_person() is what /portal/account calls on load, so this is
  // the same state a real volunteer reaches by visiting the page.
  volunteer = await signInAs(SEEDED_USERS.volunteer);
  const { data: ensured, error: ensureError } = await volunteer.rpc(
    "ensure_current_person",
  );
  if (ensureError) throw ensureError;
  volunteerPersonId = (ensured as { person_id: string }[])[0].person_id;
});

afterAll(async () => {
  // By person, not by tenant or kind: supabase/seed.sql opts the admin's own
  // person in and records one delivery for them, and the tenant-isolation
  // suite needs both of those rows to still be there.
  const madeHere = [volunteerPersonId, OTHER_PERSON_IN_TENANT, otherPersonId];
  await service
    .from("person_notification_preferences")
    .delete()
    .in("person_id", madeHere);
  await service
    .from("notification_deliveries")
    .delete()
    .in("person_id", madeHere);
  await service.from("people").delete().eq("id", otherPersonId);
  await service.from("tenants").delete().eq("id", otherTenantId);
  // supabase/seed.sql deliberately leaves volunteer@ without a people row --
  // src/lib/auth/current-person.integration.test.ts depends on that to
  // exercise the link-by-email and no-row paths -- so the one provisioned in
  // beforeAll has to go back.
  await service.from("people").delete().eq("id", volunteerPersonId);
});

describe("person_notification_preferences, as the person themselves", () => {
  test("a volunteer can save and read their own preference", async () => {
    // A volunteer holds none of people:view, people_intake:manage or
    // reimbursement_approvals:manage -- the whole point of this case.
    const { error: insertError } = await volunteer
      .from("person_notification_preferences")
      .insert({ person_id: volunteerPersonId, kind: KIND, enabled: true });
    expect(insertError).toBeNull();

    const { data, error } = await volunteer
      .from("person_notification_preferences")
      .select("person_id, kind, enabled, tenant_id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({
      person_id: volunteerPersonId,
      kind: KIND,
      enabled: true,
      tenant_id: chatterTenantId,
    });
  });

  test("a volunteer can turn their own preference off", async () => {
    const { error } = await volunteer
      .from("person_notification_preferences")
      .update({ enabled: false })
      .eq("person_id", volunteerPersonId)
      .eq("kind", KIND);
    expect(error).toBeNull();

    const { data } = await volunteer
      .from("person_notification_preferences")
      .select("enabled")
      .single();
    expect(data!.enabled).toBe(false);

    // Put it back for the rows the later cases read.
    await volunteer
      .from("person_notification_preferences")
      .update({ enabled: true })
      .eq("person_id", volunteerPersonId);
  });

  test("a volunteer cannot delete their own row", async () => {
    // The opt-out record is the evidence it was honored, so it is written, not
    // erased. Deleting is an administrator's escape hatch, not a preference.
    const { error } = await volunteer
      .from("person_notification_preferences")
      .delete()
      .eq("person_id", volunteerPersonId);
    expect(error).toBeNull(); // RLS filters rather than raising

    const { count } = await service
      .from("person_notification_preferences")
      .select("id", { count: "exact", head: true })
      .eq("person_id", volunteerPersonId);
    expect(count).toBe(1);
  });

  test("a volunteer cannot write a preference for someone else", async () => {
    const { error } = await volunteer
      .from("person_notification_preferences")
      .insert({ person_id: otherPersonId, kind: KIND, enabled: true });
    expect(error).not.toBeNull();
  });
});

describe("person_notification_preferences, as everyone else", () => {
  test("another person's row is invisible to a volunteer", async () => {
    const { error: seedError } = await service
      .from("person_notification_preferences")
      .insert({
        tenant_id: chatterTenantId,
        person_id: OTHER_PERSON_IN_TENANT,
        kind: KIND,
        enabled: true,
      });
    expect(seedError).toBeNull();

    const { data } = await volunteer
      .from("person_notification_preferences")
      .select("person_id");
    expect(data!.map((row) => row.person_id)).toEqual([volunteerPersonId]);
  });

  test("an administrator can read every row in their own tenant", async () => {
    // Contains, not equals: supabase/seed.sql opts the admin's own person in,
    // so this tenant already has a row that is neither of the two here.
    const { data, error } = await adminClient
      .from("person_notification_preferences")
      .select("person_id");
    expect(error).toBeNull();

    const visible = data!.map((row) => row.person_id);
    expect(visible).toContain(volunteerPersonId);
    expect(visible).toContain(OTHER_PERSON_IN_TENANT);
  });

  test("an administrator can delete a row, to unblock a person merge", async () => {
    // merge_people() (20260906080000) raises on a unique_violation rather than
    // dropping a row, so two people who each hold this kind cannot be merged
    // until one preference is cleared -- and this policy is the only way.
    const { error } = await adminClient
      .from("person_notification_preferences")
      .delete()
      .eq("person_id", OTHER_PERSON_IN_TENANT);
    expect(error).toBeNull();

    const { count } = await service
      .from("person_notification_preferences")
      .select("id", { count: "exact", head: true })
      .eq("person_id", OTHER_PERSON_IN_TENANT);
    expect(count).toBe(0);
  });

  test("an anonymous visitor sees nothing", async () => {
    const { data } = await anon
      .from("person_notification_preferences")
      .select("id");
    expect(data ?? []).toEqual([]);
  });

  test("another tenant's row is invisible to an administrator here", async () => {
    const { error: seedError } = await service
      .from("person_notification_preferences")
      .insert({
        tenant_id: otherTenantId,
        person_id: otherPersonId,
        kind: KIND,
        enabled: true,
      });
    expect(seedError).toBeNull();

    const { data } = await adminClient
      .from("person_notification_preferences")
      .select("tenant_id");
    expect(data!.every((row) => row.tenant_id === chatterTenantId)).toBe(true);
  });
});

describe("cross-tenant references", () => {
  test("a preference cannot point at a person in another tenant", async () => {
    // The composite foreign key, not a policy: this is the service-role client,
    // which RLS does not apply to at all -- exactly the client the digest job
    // runs on.
    const { error } = await service
      .from("person_notification_preferences")
      .insert({
        tenant_id: chatterTenantId,
        person_id: otherPersonId,
        kind: "contact_message",
      });
    expect(error?.code).toBe("23503");
  });

  test("a delivery cannot point at a person in another tenant", async () => {
    const { error } = await service.from("notification_deliveries").insert({
      tenant_id: chatterTenantId,
      person_id: otherPersonId,
      kind: KIND,
      dedupe_key: "task-digest:2026-01-01",
    });
    expect(error?.code).toBe("23503");
  });
});

describe("notification_deliveries", () => {
  const DEDUPE = "task-digest:2026-01-02";

  test("the service-role sender can record a delivery", async () => {
    const { error } = await service.from("notification_deliveries").insert({
      tenant_id: chatterTenantId,
      person_id: volunteerPersonId,
      kind: KIND,
      dedupe_key: DEDUPE,
    });
    expect(error).toBeNull();
  });

  test("a second claim for the same day loses the race", async () => {
    // This is the whole idempotency mechanism: the sender inserts before it
    // sends, so a retry or a concurrent invocation stops here instead of
    // sending a duplicate.
    const { error } = await service.from("notification_deliveries").insert({
      tenant_id: chatterTenantId,
      person_id: volunteerPersonId,
      kind: KIND,
      dedupe_key: DEDUPE,
    });
    expect(error?.code).toBe("23505");
  });

  test("an administrator can read the ledger", async () => {
    const { data, error } = await adminClient
      .from("notification_deliveries")
      .select("person_id, kind, dedupe_key");
    expect(error).toBeNull();
    expect(data!.some((row) => row.dedupe_key === DEDUPE)).toBe(true);
  });

  test("a volunteer cannot read the ledger", async () => {
    const { data } = await volunteer
      .from("notification_deliveries")
      .select("id");
    expect(data ?? []).toEqual([]);
  });

  test("an anonymous visitor cannot read the ledger", async () => {
    const { data } = await anon.from("notification_deliveries").select("id");
    expect(data ?? []).toEqual([]);
  });

  test("even an administrator cannot write to the ledger", async () => {
    // No insert/update/delete policy exists for authenticated at all: a
    // delivery record is only worth having if nothing with a session can forge
    // or amend one.
    const { error: insertError } = await adminClient
      .from("notification_deliveries")
      .insert({
        person_id: volunteerPersonId,
        kind: KIND,
        dedupe_key: "task-digest:2026-01-03",
      });
    expect(insertError).not.toBeNull();

    const { error: updateError } = await adminClient
      .from("notification_deliveries")
      .update({ status: "sent" })
      .eq("dedupe_key", DEDUPE);
    expect(updateError).not.toBeNull();
  });
});
