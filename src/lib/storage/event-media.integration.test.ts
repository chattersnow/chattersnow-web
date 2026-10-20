// Integration coverage for the private `event-media` bucket and `event_media`
// table (#1606), against a real local Supabase stack.
//
// The bucket's isolation lives in object paths and `storage.objects` policies,
// where `tenant_isolation_gaps()` can't see it, so this file is what asserts
// that staff of another tenant can neither upload to nor read this tenant's
// objects, and that the bucket itself -- not only the client -- refuses types
// outside its list.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  anonClient,
  createPublishedEvent,
  serviceRoleClient,
  signInAs,
} from "../../../test/integration-setup";
import { EVENT_MEDIA_BUCKET, eventMediaPath } from "./event-media-files";

const SETTING_KEY = "events.media_uploads_enabled";

const service = serviceRoleClient();
const anon = anonClient();

function jpeg(bytes = 4) {
  return new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
}

let admin: SupabaseClient;
let volunteer: SupabaseClient;
let tenantId: string;
let otherTenantId: string;
let event: Awaited<ReturnType<typeof createPublishedEvent>>;
let otherEventId: string;

const created: string[] = [];

function path(tenant = tenantId, eventId = event.id, ext = "jpg") {
  const value = eventMediaPath(tenant, eventId, ext);
  created.push(value);
  return value;
}

function upload(
  client: SupabaseClient,
  objectPath: string,
  body: Blob = jpeg(),
  contentType = "image/jpeg",
) {
  return client.storage
    .from(EVENT_MEDIA_BUCKET)
    .upload(objectPath, body, { contentType });
}

async function setEnabled(value: boolean | null) {
  if (value === null) {
    await service
      .from("app_settings")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("key", SETTING_KEY);
    return;
  }
  const { error } = await admin.rpc("set_event_media_uploads_enabled", {
    p_enabled: value,
  });
  if (error) throw error;
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

  // Archived, not active: a second active tenant knocks default_tenant_id()
  // off its sole-tenant fallback for every other file sharing this database.
  const { data: other, error: otherError } = await service
    .from("tenants")
    .insert({
      name: "Event Media Test Org",
      slug: `event-media-${crypto.randomUUID().slice(0, 8)}`,
      status: "archived",
    })
    .select("id")
    .single();
  if (otherError) throw otherError;
  otherTenantId = other.id as string;

  admin = await signInAs(SEEDED_USERS.admin);
  volunteer = await signInAs(SEEDED_USERS.volunteer);
  const { data: adminUser } = await admin.auth.getUser();

  const { data: otherEvent, error: otherEventError } = await service
    .from("events")
    .insert({
      tenant_id: otherTenantId,
      name: "Other tenant's event",
      starts_at: new Date().toISOString(),
      timezone: "America/Denver",
      created_by: adminUser.user!.id,
    })
    .select("id")
    .single();
  if (otherEventError) throw otherEventError;
  otherEventId = otherEvent.id as string;

  event = await createPublishedEvent();
  await setEnabled(null);
});

afterAll(async () => {
  await setEnabled(null);
  if (created.length) {
    await service.storage.from(EVENT_MEDIA_BUCKET).remove(created);
  }
  if (event) await event.cleanup();
  if (otherEventId) {
    await service.from("events").delete().eq("id", otherEventId);
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

describe("event-media bucket", () => {
  test("is private, 10 GiB and photo-or-video only", async () => {
    const { data: bucket, error } =
      await service.storage.getBucket(EVENT_MEDIA_BUCKET);
    expect(error).toBeNull();
    expect(bucket?.public).toBe(false);
    expect(bucket?.file_size_limit).toBe(10 * 1024 * 1024 * 1024);
    expect(bucket?.allowed_mime_types).toEqual([
      "video/mp4",
      "video/quicktime",
      "video/webm",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
  });

  test("refuses a type outside its list even from someone allowed to upload", async () => {
    const { error } = await upload(
      admin,
      path(),
      new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], {
        type: "application/pdf",
      }),
      "application/pdf",
    );
    expect(error).not.toBeNull();
  });
});

describe("event-media writes", () => {
  test("events:manage uploads under its own tenant and event", async () => {
    const { error } = await upload(admin, path());
    expect(error).toBeNull();
  });

  test("events:view without a place on the staff roster cannot upload", async () => {
    for (const client of [volunteer, anon]) {
      const { error } = await upload(client, path());
      expect(error).not.toBeNull();
    }
  });

  test("another tenant's prefix or event, or a malformed path, is refused", async () => {
    for (const objectPath of [
      path(otherTenantId, otherEventId),
      path(tenantId, otherEventId),
      path(tenantId, crypto.randomUUID()),
      `${tenantId}/${event.id}/not-a-uuid.jpg`,
      `${tenantId}/${event.id}/${crypto.randomUUID()}.pdf`,
    ]) {
      const { error } = await upload(admin, objectPath);
      expect(error).not.toBeNull();
    }
  });

  test("a signed upload token is minted only for someone who may upload", async () => {
    const allowed = path();
    const minted = await admin.storage
      .from(EVENT_MEDIA_BUCKET)
      .createSignedUploadUrl(allowed);
    expect(minted.error).toBeNull();
    const put = await anon.storage
      .from(EVENT_MEDIA_BUCKET)
      .uploadToSignedUrl(allowed, minted.data!.token, jpeg(), {
        contentType: "image/jpeg",
      });
    expect(put.error).toBeNull();

    const refused = await volunteer.storage
      .from(EVENT_MEDIA_BUCKET)
      .createSignedUploadUrl(path());
    expect(refused.error).not.toBeNull();
  });

  test("turning the setting off stops uploads, and on restores them", async () => {
    await setEnabled(false);
    try {
      expect((await admin.rpc("event_media_uploads_enabled")).data).toBe(false);
      expect(
        (await admin.rpc("can_upload_event_media", { p_event_id: event.id }))
          .data,
      ).toBe(false);
      expect((await upload(admin, path())).error).not.toBeNull();
    } finally {
      await setEnabled(true);
    }
    expect((await upload(admin, path())).error).toBeNull();
  });

  test("only events:manage changes the setting", async () => {
    const { error } = await volunteer.rpc("set_event_media_uploads_enabled", {
      p_enabled: false,
    });
    expect(error?.message).toBe("PERMISSION_DENIED");
  });
});

describe("event-media reads", () => {
  let otherTenantObject: string;

  beforeAll(async () => {
    otherTenantObject = path(otherTenantId, otherEventId);
    const { error } = await upload(service, otherTenantObject);
    if (error) throw error;
  });

  test("staff of another tenant cannot read this tenant's objects", async () => {
    // Seen from the other side: this tenant's admin holding the path of an
    // object in another tenant's folder gets nothing for it.
    const signed = await admin.storage
      .from(EVENT_MEDIA_BUCKET)
      .createSignedUrl(otherTenantObject, 60);
    expect(signed.error).not.toBeNull();
    const download = await admin.storage
      .from(EVENT_MEDIA_BUCKET)
      .download(otherTenantObject);
    expect(download.error).not.toBeNull();
    const listed = await admin.storage
      .from(EVENT_MEDIA_BUCKET)
      .list(`${otherTenantId}/${otherEventId}`);
    expect(listed.data ?? []).toEqual([]);
  });

  test("events:view reads its own tenant's objects; anon reads nothing", async () => {
    const own = path();
    expect((await upload(admin, own)).error).toBeNull();
    expect(
      (
        await volunteer.storage
          .from(EVENT_MEDIA_BUCKET)
          .createSignedUrl(own, 60)
      ).error,
    ).toBeNull();
    expect(
      (await anon.storage.from(EVENT_MEDIA_BUCKET).download(own)).error,
    ).not.toBeNull();
  });
});

describe("record_event_media", () => {
  test("records the size and type the object arrived with, once", async () => {
    const objectPath = path();
    expect((await upload(admin, objectPath, jpeg(1234))).error).toBeNull();

    const first = await admin.rpc("record_event_media", {
      p_path: objectPath,
      p_original_filename: "IMG_0001.HEIC",
    });
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({
      event_id: event.id,
      tenant_id: tenantId,
      kind: "photo",
      content_type: "image/jpeg",
      size_bytes: 1234,
      original_filename: "IMG_0001.HEIC",
    });

    const again = await admin.rpc("record_event_media", {
      p_path: objectPath,
      p_original_filename: "IMG_0001.HEIC",
    });
    expect(again.data?.id).toBe(first.data!.id);

    const { data: rows } = await volunteer
      .from("event_media")
      .select("id")
      .eq("event_id", event.id);
    expect(rows?.map((row) => row.id)).toContain(first.data!.id);
  });

  test("refuses a path with no object, or one the caller may not upload to", async () => {
    const missing = await admin.rpc("record_event_media", {
      p_path: path(),
      p_original_filename: "x.jpg",
    });
    expect(missing.error?.message).toBe("MEDIA_NOT_FOUND");

    const objectPath = path();
    expect((await upload(admin, objectPath)).error).toBeNull();
    const denied = await volunteer.rpc("record_event_media", {
      p_path: objectPath,
      p_original_filename: "x.jpg",
    });
    expect(denied.error?.message).toBe("PERMISSION_DENIED");
  });

  test("rows cannot be inserted directly", async () => {
    const { error } = await admin.from("event_media").insert({
      event_id: event.id,
      storage_path: path(),
      original_filename: "x.jpg",
      content_type: "image/jpeg",
      size_bytes: 1,
    });
    expect(error).not.toBeNull();
  });

  test("an event with media can't be deleted", async () => {
    const { data } = await admin.rpc("event_delete_blockers", {
      p_id: event.id,
    });
    expect(JSON.stringify(data)).toMatch(/photo/);
  });
});
