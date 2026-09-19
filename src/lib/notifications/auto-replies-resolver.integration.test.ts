// Integration coverage for auto_reply_templates (#1233): its policies, and
// the resolver reading it the way the sender will.
//
// The table holds what an organization says to the people who write to it, so
// the questions worth asking a real stack are who may change that wording and
// whose wording a sender gets back. Both are RLS answers a mock cannot give.
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
import { autoReplyDefaults, autoReplyDefinition } from "./auto-replies";
import { resolveAutoReply } from "./auto-replies-resolver";

const service = serviceRoleClient();
const anon = anonClient();

const KIND = "event_registration_confirmation";
const EVENT = autoReplyDefinition(KIND)!;
const TENANT_INTRO = "You're in. Here is everything you need for the day:";

let volunteer: SupabaseClient;
let tenantId: string;
let otherTenantId: string;

beforeAll(async () => {
  volunteer = await signInAs(SEEDED_USERS.volunteer);

  const { data: tenant, error } = await service
    .from("tenants")
    .select("id")
    .order("created_at")
    .limit(1)
    .single();
  if (error) throw error;
  tenantId = tenant.id as string;

  // Archived rather than active, for the reason preferences.integration.test.ts
  // gives: a second *active* tenant knocks default_tenant_id() off its
  // sole-tenant fallback for every other file sharing this database.
  const { data: other, error: otherError } = await service
    .from("tenants")
    .insert({
      name: "Auto Reply Test Org",
      slug: `auto-reply-${crypto.randomUUID().slice(0, 8)}`,
      status: "archived",
    })
    .select("id")
    .single();
  if (otherError) throw otherError;
  otherTenantId = other.id as string;

  const { error: otherRowError } = await service
    .from("auto_reply_templates")
    .insert({
      tenant_id: otherTenantId,
      kind: KIND,
      slots: { intro: "Another organization's words entirely." },
    });
  if (otherRowError) throw otherRowError;
});

afterAll(async () => {
  await service.from("auto_reply_templates").delete().eq("tenant_id", tenantId);
  await service
    .from("auto_reply_templates")
    .delete()
    .eq("tenant_id", otherTenantId);
  // retention_policies first: a trigger on `tenants` seeds every new tenant's
  // rules (#707 Phase 5b) and that foreign key is `no action` like every other
  // one to tenants, so the tenant delete fails while they stand -- and it
  // fails quietly enough that the next file to read a per-tenant table as
  // service_role is the one that notices.
  await service
    .from("retention_policies")
    .delete()
    .eq("tenant_id", otherTenantId);
  const { error } = await service
    .from("tenants")
    .delete()
    .eq("id", otherTenantId);
  if (error) throw error;
});

describe("the seed", () => {
  test("leaves the tenant on the platform's defaults", async () => {
    // The acceptance criterion for `bun run db:reset`: no row anywhere, so
    // every receipt still reads exactly as it did before this table existed.
    const { count, error } = await service
      .from("auto_reply_templates")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    expect(error).toBeNull();
    expect(count).toBe(0);
  });
});

describe("who may write the organization's words", () => {
  test("a system_settings:manage holder writes and reads its tenant's row", async () => {
    const { data, error } = await adminClient
      .from("auto_reply_templates")
      .insert({ kind: KIND, slots: { intro: TENANT_INTRO } })
      .select("id, tenant_id, enabled, slots")
      .single();
    expect(error).toBeNull();
    // tenant_id came from default_tenant_id(), not from the client.
    expect(data!.tenant_id).toBe(tenantId);
    expect(data!.enabled).toBe(true);

    const { data: read } = await adminClient
      .from("auto_reply_templates")
      .select("slots")
      .eq("kind", KIND)
      .single();
    expect((read!.slots as Record<string, string>).intro).toBe(TENANT_INTRO);
  });

  test("and can switch one receipt off", async () => {
    const { data, error } = await adminClient
      .from("auto_reply_templates")
      .update({ enabled: false })
      .eq("kind", KIND)
      .select("enabled, updated_by")
      .single();
    expect(error).toBeNull();
    expect(data!.enabled).toBe(false);
    // set_updated_at stamps auth.uid(), so an edit names its author without
    // the action having to remember to.
    expect(data!.updated_by).not.toBeNull();

    await adminClient
      .from("auto_reply_templates")
      .update({ enabled: true })
      .eq("kind", KIND);
  });

  test("the edit is in the audit trail", async () => {
    const { data, error } = await adminClient
      .from("audit_log")
      .select("action")
      .eq("table_name", "auto_reply_templates")
      .order("occurred_at", { ascending: false })
      .limit(5);
    expect(error).toBeNull();
    expect(data!.map((row) => row.action)).toContain("update");
  });

  test("a volunteer can neither read nor write it", async () => {
    const { count, error } = await volunteer
      .from("auto_reply_templates")
      .select("id", { count: "exact", head: true });
    expect(error).toBeNull();
    expect(count).toBe(0);

    const insert = await volunteer
      .from("auto_reply_templates")
      .insert({ kind: "gear_request_confirmation", slots: {} });
    expect(insert.error?.code).toBe("42501");

    const update = await volunteer
      .from("auto_reply_templates")
      .update({ enabled: false })
      .eq("kind", KIND)
      .select("id");
    expect(update.data ?? []).toEqual([]);
  });

  test("nobody signed out can read it", async () => {
    const { count, error } = await anon
      .from("auto_reply_templates")
      .select("id", { count: "exact", head: true });
    // Either an outright refusal or an empty result is correct; what must
    // never happen is a row coming back.
    if (!error) expect(count).toBe(0);
  });

  test("a row cannot be deleted from a session at all", async () => {
    // Deliberate: "back to the platform's wording" is an empty slots object,
    // not a missing row, so the audit anchor survives the reset.
    const { error } = await adminClient
      .from("auto_reply_templates")
      .delete()
      .eq("kind", KIND);
    expect(error?.code).toBe("42501");
  });

  test("another tenant's row is invisible", async () => {
    const { count, error } = await adminClient
      .from("auto_reply_templates")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", otherTenantId);
    expect(error).toBeNull();
    expect(count).toBe(0);
  });
});

describe("resolveAutoReply against the real table", () => {
  test("folds the tenant's row over the defaults", async () => {
    const resolved = await resolveAutoReply(service, tenantId, KIND);
    expect(resolved.enabled).toBe(true);
    expect(resolved.slots.intro).toBe(TENANT_INTRO);
    // Untouched slots still come from the registry, which is what makes
    // improving a default reach every tenant who never rewrote it.
    expect(resolved.slots.subject).toBe(autoReplyDefaults(EVENT).subject);
  });

  test("resolves each tenant's own words", async () => {
    const resolved = await resolveAutoReply(service, otherTenantId, KIND);
    expect(resolved.slots.intro).toBe("Another organization's words entirely.");
  });

  test("a kind the tenant has never touched is the platform's wording", async () => {
    const resolved = await resolveAutoReply(
      service,
      tenantId,
      "gear_request_confirmation",
    );
    expect(resolved.enabled).toBe(true);
    expect(resolved.slots).toEqual(
      autoReplyDefaults(autoReplyDefinition("gear_request_confirmation")!),
    );
  });
});
