// Integration coverage for event media upload links (#1620) against a real
// local Supabase stack: staff creating and revoking links, the anonymous page,
// slot claims and their byte cap, recording through a link (attribution,
// thumbnail, rights snapshot), taking a file back by its receipt, and every
// way a link stops working answering with the same LINK_INVALID.
//
// The service-role signed upload the Server Action makes is stood in for by a
// service-role upload of the same path: what is under test is what the
// database accepts afterwards.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mintConfirmationToken } from "@/lib/notifications/notification-email-token";
import {
  SEEDED_USERS,
  anonClient,
  createPublishedEvent,
  serviceRoleClient,
  signInAs,
  uniqueIp,
} from "../../../test/integration-setup";
import {
  EVENT_MEDIA_BUCKET,
  eventMediaPath,
  eventMediaThumbPath,
} from "./event-media-files";

const GIB = 1024 * 1024 * 1024;
const DAY = 24 * 60 * 60 * 1000;

const service = serviceRoleClient();
const anon = anonClient();

let admin: SupabaseClient;
let volunteer: SupabaseClient;
let tenantId: string;
let otherTenantId: string;
let event: Awaited<ReturnType<typeof createPublishedEvent>>;
let secondEvent: Awaited<ReturnType<typeof createPublishedEvent>>;
let otherEventId: string;

const objects: string[] = [];

async function createLink(
  overrides: { label?: string; maxBytes?: number; eventId?: string } = {},
) {
  const { token, hash } = mintConfirmationToken();
  const { data, error } = await admin.rpc("create_event_media_upload_link", {
    p_event_id: overrides.eventId ?? event.id,
    p_label: overrides.label ?? "Sam — photographer",
    p_token_hash: hash,
    p_expires_at: new Date(Date.now() + 7 * DAY).toISOString(),
    p_max_bytes: overrides.maxBytes ?? 50 * GIB,
  });
  if (error) throw error;
  return { id: data as string, token, hash };
}

/** A link written straight into the table, for the states staff cannot make. */
async function insertLink(row: {
  tenant_id: string;
  event_id: string;
  expires_at: string;
}) {
  const { hash } = mintConfirmationToken();
  const { error } = await service
    .from("event_media_upload_links")
    .insert({ ...row, label: "Raw link", token_hash: hash });
  if (error) throw error;
  return hash;
}

function openPage(hash: string, client = anon) {
  return client.rpc("get_event_media_upload_link", {
    p_token_hash: hash,
    p_ip_address: uniqueIp(),
  });
}

function claim(hash: string, bytes = 1000, count = 1) {
  return anon.rpc("claim_event_media_link_upload_slots", {
    p_token_hash: hash,
    p_count: count,
    p_bytes: bytes,
    p_ip_address: uniqueIp(),
  });
}

/** Stores an object the way a signed upload would, and returns its path. */
async function store(
  ext: "png" | "mp4",
  eventId = event.id,
  withThumb = false,
) {
  const path = eventMediaPath(tenantId, eventId, ext);
  const type = ext === "png" ? "image/png" : "video/mp4";
  const { error } = await service.storage
    .from(EVENT_MEDIA_BUCKET)
    .upload(path, new Blob([new Uint8Array(64)], { type }), {
      contentType: type,
    });
  if (error) throw error;
  objects.push(path);
  if (withThumb) {
    const thumb = eventMediaThumbPath(path);
    const { error: thumbError } = await service.storage
      .from(EVENT_MEDIA_BUCKET)
      .upload(thumb, new Blob([new Uint8Array(8)], { type: "image/jpeg" }), {
        contentType: "image/jpeg",
      });
    if (thumbError) throw thumbError;
    objects.push(thumb);
  }
  return path;
}

function record(
  hash: string,
  path: string,
  options: { rights?: boolean; receiptHash?: string } = {},
) {
  return anon.rpc("record_event_media_by_link", {
    p_token_hash: hash,
    p_path: path,
    p_original_filename: "DSC_0001.png",
    p_rights_confirmed: options.rights ?? true,
    p_receipt_hash: options.receiptHash ?? mintConfirmationToken().hash,
    p_ip_address: uniqueIp(),
  });
}

async function setEnabled(value: boolean) {
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

  // Archived, not active: a second active tenant knocks the sole-tenant
  // fallback out from under every other file sharing this database.
  const { data: other, error: otherError } = await service
    .from("tenants")
    .insert({
      name: "Upload Link Test Org",
      slug: `upload-link-${crypto.randomUUID().slice(0, 8)}`,
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
  secondEvent = await createPublishedEvent();
});

afterAll(async () => {
  await service
    .from("app_settings")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("key", "events.media_uploads_enabled");
  if (objects.length) {
    await service.storage.from(EVENT_MEDIA_BUCKET).remove(objects);
  }
  for (const fixture of [event, secondEvent]) {
    if (!fixture) continue;
    await service.from("event_media").delete().eq("event_id", fixture.id);
    await fixture.cleanup();
  }
  if (otherEventId)
    await service.from("events").delete().eq("id", otherEventId);
  if (otherTenantId) {
    // Provisioning gives a tenant its retention policies, which hold it.
    await service
      .from("retention_policies")
      .delete()
      .eq("tenant_id", otherTenantId);
    await service.from("tenants").delete().eq("id", otherTenantId);
  }
});

describe("creating links", () => {
  test("a volunteer with events:view cannot create one", async () => {
    const { hash } = mintConfirmationToken();
    const { error } = await volunteer.rpc("create_event_media_upload_link", {
      p_event_id: event.id,
      p_label: "Nope",
      p_token_hash: hash,
      p_expires_at: new Date(Date.now() + DAY).toISOString(),
      p_max_bytes: 50 * GIB,
    });
    expect(error?.message).toContain("PERMISSION_DENIED");
  });

  test("an expiry in the past is refused", async () => {
    const { hash } = mintConfirmationToken();
    const { error } = await admin.rpc("create_event_media_upload_link", {
      p_event_id: event.id,
      p_label: "Late",
      p_token_hash: hash,
      p_expires_at: new Date(Date.now() - DAY).toISOString(),
      p_max_bytes: 50 * GIB,
    });
    expect(error?.message).toContain("INVALID_EXPIRY");
  });

  test("the token hash is not readable, even by events:manage", async () => {
    await createLink();
    const { error } = await admin
      .from("event_media_upload_links")
      .select("token_hash")
      .limit(1);
    expect(error).not.toBeNull();
  });
});

describe("the page", () => {
  test("shows the event, the label and nothing else", async () => {
    const link = await createLink({ label: "Sam — photographer" });
    const { data, error } = await openPage(link.hash);
    expect(error).toBeNull();
    const page = data as Record<string, unknown>;
    expect(Object.keys(page).sort()).toEqual(
      [
        "ends_at",
        "event_name",
        "expires_at",
        "label",
        "rights_terms",
        "starts_at",
        "timezone",
      ].sort(),
    );
    expect(page.event_name).toBe(event.name);
    expect(page.label).toBe("Sam — photographer");
  });

  test("every dead link is the same LINK_INVALID", async () => {
    const expired = await insertLink({
      tenant_id: tenantId,
      event_id: event.id,
      expires_at: new Date(Date.now() - DAY).toISOString(),
    });
    const otherTenant = await insertLink({
      tenant_id: otherTenantId,
      event_id: otherEventId,
      expires_at: new Date(Date.now() + DAY).toISOString(),
    });
    const revoked = await createLink();
    expect(
      (
        await admin.rpc("revoke_event_media_upload_link", {
          p_link_id: revoked.id,
        })
      ).error,
    ).toBeNull();
    const live = await createLink();

    for (const hash of [
      expired,
      otherTenant,
      revoked.hash,
      mintConfirmationToken().hash,
    ]) {
      const { error } = await openPage(hash);
      expect(error?.message).toContain("LINK_INVALID");
    }

    // The right link on another host's tenant.
    const wrongHost = await openPage(
      live.hash,
      anonClient({ slug: "no-such-tenant" }),
    );
    expect(wrongHost.error?.message).toContain("LINK_INVALID");

    // Uploads turned off kills existing links, and on brings them back.
    await setEnabled(false);
    try {
      expect((await openPage(live.hash)).error?.message).toContain(
        "LINK_INVALID",
      );
      expect((await claim(live.hash)).error?.message).toContain("LINK_INVALID");
    } finally {
      await setEnabled(true);
    }
    expect((await openPage(live.hash)).error).toBeNull();
  });
});

describe("uploading through a link", () => {
  test("a recorded photo is attributed to the link, with its thumbnail and rights", async () => {
    const link = await createLink({ label: "Sam — photographer" });
    const { data: claimed, error: claimError } = await claim(
      link.hash,
    ).single();
    expect(claimError).toBeNull();
    expect(claimed).toEqual({ tenant_id: tenantId, event_id: event.id });

    const path = await store("png", event.id, true);
    const { data: id, error } = await record(link.hash, path);
    expect(error).toBeNull();

    const { data: row } = await admin
      .from("event_media")
      .select(
        "upload_link_id, uploaded_by, thumb_path, content_type, rights_confirmed_at, rights_terms, uploader_name",
      )
      .eq("id", id as string)
      .single();
    expect(row).toMatchObject({
      upload_link_id: link.id,
      uploaded_by: null,
      thumb_path: eventMediaThumbPath(path),
      content_type: "image/png",
      rights_terms: null,
      uploader_name: "Sam — photographer (upload link)",
    });
    expect(row?.rights_confirmed_at).not.toBeNull();

    const { data: links } = await admin.rpc("event_media_upload_link_list", {
      p_event_id: event.id,
    });
    const listed = (
      (links ?? []) as { id: string; files: number; bytes: number }[]
    ).find((entry) => entry.id === link.id);
    expect(listed?.files).toBe(1);
    expect(Number(listed?.bytes)).toBe(64);
  });

  test("not without the rights confirmed", async () => {
    const link = await createLink();
    const path = await store("mp4");
    const { error } = await record(link.hash, path, { rights: false });
    expect(error?.message).toContain("RIGHTS_REQUIRED");
  });

  test("not for a path under another event", async () => {
    const link = await createLink();
    const path = await store("mp4", secondEvent.id);
    const { error } = await record(link.hash, path);
    expect(error?.message).toContain("PERMISSION_DENIED");
  });

  test("not past the link's byte cap", async () => {
    const link = await createLink({ maxBytes: GIB });
    expect((await claim(link.hash, GIB / 2)).error).toBeNull();
    const { error } = await claim(link.hash, 2 * GIB);
    expect(error?.message).toContain("OVER_CAP");
  });

  test("a file can be taken back only with its receipt", async () => {
    const link = await createLink();
    const path = await store("png", event.id, true);
    const receipt = mintConfirmationToken();
    const { data: id } = await record(link.hash, path, {
      receiptHash: receipt.hash,
    });

    const wrong = await anon.rpc("delete_event_media_by_link", {
      p_token_hash: link.hash,
      p_media_id: id as string,
      p_receipt_hash: mintConfirmationToken().hash,
      p_ip_address: uniqueIp(),
    });
    expect(wrong.error?.message).toContain("MEDIA_NOT_FOUND");

    const right = await anon.rpc("delete_event_media_by_link", {
      p_token_hash: link.hash,
      p_media_id: id as string,
      p_receipt_hash: receipt.hash,
      p_ip_address: uniqueIp(),
    });
    expect(right.error).toBeNull();
    expect(right.data).toEqual([
      { storage_path: path, thumb_path: eventMediaThumbPath(path) },
    ]);
    const { data: gone } = await service
      .from("event_media")
      .select("id")
      .eq("id", id as string);
    expect(gone).toEqual([]);
  });
});
