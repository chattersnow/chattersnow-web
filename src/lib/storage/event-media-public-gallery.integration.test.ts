// Integration coverage for the public event gallery (#1654), against a real
// local Supabase stack: photos public on upload and videos not, whoever
// records them; only events:manage changes it; and public_event_media() --
// the only public read -- answers for a public, published event of the
// tenant it is asked about, while the gallery setting is on, and for nobody
// but the service role.
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

const GALLERY_KEY = "events.public_gallery_enabled";

const service = serviceRoleClient();
const anon = anonClient();

let admin: SupabaseClient;
let volunteer: SupabaseClient;
let tenantId: string;
let event: Awaited<ReturnType<typeof createPublishedEvent>>;
let photoId: string;
let videoId: string;
const created: string[] = [];

async function record(ext: string, contentType: string): Promise<string> {
  const objectPath = eventMediaPath(tenantId, event.id, ext);
  created.push(objectPath);
  const { error: uploadError } = await admin.storage
    .from(EVENT_MEDIA_BUCKET)
    .upload(objectPath, new Blob([new Uint8Array(4)], { type: contentType }), {
      contentType,
    });
  if (uploadError) throw uploadError;
  const { data, error } = await admin.rpc("record_event_media", {
    p_path: objectPath,
    p_original_filename: `secret-name.${ext}`,
  });
  if (error) throw error;
  return (data as { id: string }).id;
}

async function publicRows(tenant = tenantId) {
  const { data, error } = await service.rpc("public_event_media", {
    p_tenant_id: tenant,
    p_event_id: event.id,
  });
  if (error) throw error;
  return (data ?? []) as Record<string, unknown>[];
}

async function resetGallerySetting() {
  await service
    .from("app_settings")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("key", GALLERY_KEY);
}

beforeAll(async () => {
  const { data: tenant, error } = await service
    .from("tenants")
    .select("id")
    .order("created_at")
    .limit(1)
    .single();
  if (error) throw error;
  tenantId = tenant.id as string;

  admin = await signInAs(SEEDED_USERS.admin);
  volunteer = await signInAs(SEEDED_USERS.volunteer);
  event = await createPublishedEvent();
  await resetGallerySetting();

  photoId = await record("jpg", "image/jpeg");
  videoId = await record("mp4", "video/mp4");
});

afterAll(async () => {
  await resetGallerySetting();
  if (created.length) {
    await service.storage.from(EVENT_MEDIA_BUCKET).remove(created);
  }
  if (event) {
    await service.from("event_media").delete().eq("event_id", event.id);
    await event.cleanup();
  }
});

describe("event_media.is_public", () => {
  test("a photo is public on upload and a video is not", async () => {
    const { data, error } = await admin
      .from("event_media")
      .select("id, is_public")
      .in("id", [photoId, videoId]);
    expect(error).toBeNull();
    const byId = new Map(data!.map((row) => [row.id, row.is_public]));
    expect(byId.get(photoId)).toBe(true);
    expect(byId.get(videoId)).toBe(false);
  });

  test("events:view can neither call the switch nor write the column", async () => {
    const denied = await volunteer.rpc("set_event_media_public", {
      p_ids: [videoId],
      p_public: true,
    });
    expect(denied.error?.message).toBe("PERMISSION_DENIED");

    // No update grant on the column for anyone: the function is the writer.
    const direct = await admin
      .from("event_media")
      .update({ is_public: true })
      .eq("id", videoId);
    expect(direct.error).not.toBeNull();
  });

  test("events:manage makes a video public and hides it again", async () => {
    const shown = await admin.rpc("set_event_media_public", {
      p_ids: [videoId],
      p_public: true,
    });
    expect(shown.error).toBeNull();
    expect(shown.data).toBe(1);
    // Already public: nothing changes.
    const again = await admin.rpc("set_event_media_public", {
      p_ids: [videoId],
      p_public: true,
    });
    expect(again.data).toBe(0);
    expect((await publicRows()).map((row) => row.id)).toContain(videoId);

    await admin.rpc("set_event_media_public", {
      p_ids: [videoId],
      p_public: false,
    });
    expect((await publicRows()).map((row) => row.id)).not.toContain(videoId);
  });
});

describe("public_event_media", () => {
  test("is not callable by anon or a signed-in user", async () => {
    const asAnon = await anon.rpc("public_event_media", {
      p_tenant_id: tenantId,
      p_event_id: event.id,
    });
    expect(asAnon.error).not.toBeNull();
    const asAdmin = await admin.rpc("public_event_media", {
      p_tenant_id: tenantId,
      p_event_id: event.id,
    });
    expect(asAdmin.error).not.toBeNull();
  });

  test("returns the public photo with nothing about who sent it", async () => {
    const rows = await publicRows();
    expect(rows.map((row) => row.id)).toEqual([photoId]);
    expect(Object.keys(rows[0]).sort()).toEqual(
      ["caption", "content_type", "id", "kind", "path", "uploaded_at"].sort(),
    );
    expect(JSON.stringify(rows)).not.toContain("secret-name");
  });

  test("answers nothing for another tenant", async () => {
    expect(await publicRows(crypto.randomUUID())).toEqual([]);
  });

  test("answers nothing for a private or draft event", async () => {
    await service
      .from("events")
      .update({ visibility: "private" })
      .eq("id", event.id);
    expect(await publicRows()).toEqual([]);
    await service
      .from("events")
      .update({ visibility: "public", status: "draft" })
      .eq("id", event.id);
    expect(await publicRows()).toEqual([]);
    await service
      .from("events")
      .update({ status: "published" })
      .eq("id", event.id);
    expect(await publicRows()).toHaveLength(1);
  });

  test("answers nothing while the gallery setting is off", async () => {
    const denied = await volunteer.rpc("set_event_public_gallery_enabled", {
      p_enabled: false,
    });
    expect(denied.error?.message).toBe("PERMISSION_DENIED");

    const { data: before } = await admin.rpc("event_public_gallery_enabled");
    expect(before).toBe(true);

    const off = await admin.rpc("set_event_public_gallery_enabled", {
      p_enabled: false,
    });
    expect(off.error).toBeNull();
    expect((await admin.rpc("event_public_gallery_enabled")).data).toBe(false);
    expect(await publicRows()).toEqual([]);

    await resetGallerySetting();
    expect(await publicRows()).toHaveLength(1);
  });

  test("a hidden photo is gone from the next read", async () => {
    await admin.rpc("set_event_media_public", {
      p_ids: [photoId],
      p_public: false,
    });
    expect(await publicRows()).toEqual([]);
    await admin.rpc("set_event_media_public", {
      p_ids: [photoId],
      p_public: true,
    });
  });
});
