// Integration coverage for the `gear-photos` bucket (#781), against a real
// local Supabase stack.
//
// This file exists because `tenant_isolation_gaps()` cannot see it. That
// function scans `public` for tables carrying a `tenant_id` column, and the
// bucket's isolation lives somewhere it can't reach -- in the *object path*, as
// a `{tenant_id}/` prefix enforced by policies on `storage.objects`. So the
// cross-tenant case below is the only thing standing in for the invariant the
// isolation suite asserts everywhere else.
//
// The other case worth writing the file for is the volunteer. Gear intake is a
// volunteer's job and volunteers hold `inventory: none` -- a policy gated on
// `inventory:manage` alone would look correct, pass every admin test, and lock
// out the only people the feature is for.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  anonClient,
  serviceRoleClient,
  signInAs,
} from "../../../test/integration-setup";
import { GEAR_PHOTOS_BUCKET } from "./gear-photos";

const service = serviceRoleClient();
const anon = anonClient();

/**
 * A tiny stand-in for a photo. Storage matches `allowed_mime_types` against the
 * declared content type rather than by sniffing the bytes, so the JPEG magic
 * number is enough and there is no need to carry a real image in the file.
 */
function jpegBlob() {
  return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], {
    type: "image/jpeg",
  });
}

let admin: SupabaseClient;
let volunteer: SupabaseClient;
let finance: SupabaseClient;
let board: SupabaseClient;
let tenantId: string;
let otherTenantId: string;

/** Every path written here, cleaned up as service_role regardless of policy. */
const created: string[] = [];

function path(prefix: string) {
  const name = `${prefix}/${crypto.randomUUID()}.jpg`;
  created.push(name);
  return name;
}

beforeAll(async () => {
  const { data: tenant, error: tenantError } = await service
    .from("tenants")
    .select("id")
    .order("created_at")
    .limit(1)
    .single();
  if (tenantError) throw tenantError;
  tenantId = tenant.id as string;

  // Archived, not active, for the same reason as preferences.integration.test.ts:
  // a second *active* tenant knocks default_tenant_id() off its sole-tenant
  // fallback for every other file sharing this database.
  const { data: other, error: otherError } = await service
    .from("tenants")
    .insert({
      name: "Gear Photo Test Org",
      slug: `gear-photo-${crypto.randomUUID().slice(0, 8)}`,
      status: "archived",
    })
    .select("id")
    .single();
  if (otherError) throw otherError;
  otherTenantId = other.id as string;

  admin = await signInAs(SEEDED_USERS.admin);
  volunteer = await signInAs(SEEDED_USERS.volunteer);
  finance = await signInAs(SEEDED_USERS.finance);
  board = await signInAs(SEEDED_USERS.board);
});

afterAll(async () => {
  if (created.length) {
    await service.storage.from(GEAR_PHOTOS_BUCKET).remove(created);
  }
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

describe("gear-photos bucket", () => {
  // Read through the Storage API, not PostgREST: `storage` is deliberately not
  // an exposed schema.
  test("is public, size-capped and image-only", async () => {
    const { data: bucket, error: bucketError } =
      await service.storage.getBucket(GEAR_PHOTOS_BUCKET);
    expect(bucketError).toBeNull();
    expect(bucket?.public).toBe(true);
    expect(bucket?.file_size_limit).toBe(5242880);
    expect(bucket?.allowed_mime_types).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
  });
});

describe("gear-photos writes", () => {
  test("an admin can upload under their own tenant prefix", async () => {
    const { error } = await admin.storage
      .from(GEAR_PHOTOS_BUCKET)
      .upload(path(tenantId), jpegBlob(), { contentType: "image/jpeg" });
    expect(error).toBeNull();
  });

  // The case the feature exists for: intake volunteers hold inventory:none and
  // inventory_intake:manage.
  test("a volunteer can upload under their own tenant prefix", async () => {
    const { error } = await volunteer.storage
      .from(GEAR_PHOTOS_BUCKET)
      .upload(path(tenantId), jpegBlob(), { contentType: "image/jpeg" });
    expect(error).toBeNull();
  });

  test("finance and board cannot upload", async () => {
    for (const client of [finance, board]) {
      const { error } = await client.storage
        .from(GEAR_PHOTOS_BUCKET)
        .upload(path(tenantId), jpegBlob(), { contentType: "image/jpeg" });
      expect(error).not.toBeNull();
    }
  });

  test("an anonymous caller cannot upload", async () => {
    const { error } = await anon.storage
      .from(GEAR_PHOTOS_BUCKET)
      .upload(path(tenantId), jpegBlob(), { contentType: "image/jpeg" });
    expect(error).not.toBeNull();
  });

  // The tenant-isolation assertion tenant_isolation_gaps() cannot make.
  test("a volunteer cannot upload under another tenant's prefix", async () => {
    const { error } = await volunteer.storage
      .from(GEAR_PHOTOS_BUCKET)
      .upload(path(otherTenantId), jpegBlob(), { contentType: "image/jpeg" });
    expect(error).not.toBeNull();
  });

  // The bucket is flat on purpose; a nested path is how a caller would try to
  // smuggle something past a prefix check that only looked at the first folder.
  test("a nested path is refused", async () => {
    const name = `${tenantId}/nested/${crypto.randomUUID()}.jpg`;
    created.push(name);
    const { error } = await volunteer.storage
      .from(GEAR_PHOTOS_BUCKET)
      .upload(name, jpegBlob(), { contentType: "image/jpeg" });
    expect(error).not.toBeNull();
  });
});

describe("gear-photos reads and deletes", () => {
  test("the public URL serves without any credentials", async () => {
    const name = path(tenantId);
    const { error } = await admin.storage
      .from(GEAR_PHOTOS_BUCKET)
      .upload(name, jpegBlob(), { contentType: "image/jpeg" });
    expect(error).toBeNull();

    const { data } = admin.storage.from(GEAR_PHOTOS_BUCKET).getPublicUrl(name);
    // A plain fetch, not a Supabase client: this asserts the anonymous path
    // that /inventory and next/image actually take.
    const response = await fetch(data.publicUrl);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/jpeg");
  });

  // remove() resolves the object through `select` first, so with no select
  // policy this returns an empty array and no error -- deleting nothing while
  // looking like it worked. Asserting the returned array is what catches that.
  test("an admin can delete under their own prefix", async () => {
    const name = path(tenantId);
    await admin.storage
      .from(GEAR_PHOTOS_BUCKET)
      .upload(name, jpegBlob(), { contentType: "image/jpeg" });

    const { data, error } = await admin.storage
      .from(GEAR_PHOTOS_BUCKET)
      .remove([name]);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });
});
