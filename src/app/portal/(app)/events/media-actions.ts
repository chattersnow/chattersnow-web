"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkUser } from "@/lib/auth/current-user";
import {
  checkPermission,
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import {
  EVENT_MEDIA_BUCKET,
  EVENT_MEDIA_RETENTION_PRESETS,
  eventMediaDownloadUrl,
  eventMediaPath,
  planEventMediaFile,
  type EventMediaKind,
  type EventMediaSlot,
} from "@/lib/storage/event-media-files";

export type EventMediaRow = {
  id: string;
  kind: EventMediaKind;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
  uploader_name: string | null;
  /** Short-lived signed read URL; null when the object could not be signed. */
  url: string | null;
  /** The same signature, saving as the original filename. */
  download_url: string | null;
  /** When the retention setting deletes it; null when kept indefinitely. */
  expires_at: string | null;
};

export type EventMediaState = {
  /** The tenant's Event media uploads setting. */
  enabled: boolean;
  /** Whether this reader may upload to this event right now. */
  canUpload: boolean;
  /** events:manage, which the bucket's and the table's delete policies ask for. */
  canDelete: boolean;
  /** Bytes stored for this event, and for all of the tenant's event media. */
  eventBytes: number;
  tenantBytes: number;
  /** Active registrations of this event that objected to being photographed. */
  photoObjections: number;
  /** The tenant's retention period in days; null keeps media indefinitely. */
  retentionDays: number | null;
  /** When this event's media expires, before any late upload's later date. */
  eventExpiresAt: string | null;
  items: EventMediaRow[];
};

/**
 * An hour, as for documents (#1489): long enough to look through an event's
 * photos or watch a clip, short enough that a copied link is not a way to
 * hand footage on. Never stored; every load signs afresh.
 */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** More than a phone's camera roll for one event is a second batch. */
const MAX_FILES_PER_BATCH = 100;

/**
 * The event's Media card (#1606, #1607): what has been uploaded, each with a
 * signed URL, who may upload or delete, and the card's storage and
 * photo-objection figures. Gated on events:view, like the bucket's read policy.
 *
 * Signed on the reader's own client, so the bucket's select policy decides
 * whether a path resolves. A path that fails to sign keeps its row with a null
 * URL: one missing object must not blank the gallery.
 */
export async function getEventMediaAction(
  eventId: string,
): Promise<{ data: EventMediaState } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "events", "view");
  if (permissionError) return permissionError;

  const [
    enabled,
    canUpload,
    summary,
    rows,
    permissions,
    retentionDays,
    eventExpiresAt,
  ] = await Promise.all([
    supabase.rpc("event_media_uploads_enabled"),
    supabase.rpc("can_upload_event_media", { p_event_id: eventId }),
    supabase.rpc("event_media_summary", { p_event_id: eventId }).single(),
    supabase
      .from("event_media")
      .select(
        "id, kind, storage_path, original_filename, content_type, size_bytes, uploaded_at, uploader_name, expires_at",
      )
      .eq("event_id", eventId)
      .order("uploaded_at", { ascending: false }),
    getCurrentUserPermissions(supabase),
    supabase.rpc("event_media_retention_days"),
    supabase.rpc("event_media_event_expires_at", { p_event_id: eventId }),
  ]);

  if (rows.error) {
    return { error: "Could not load this event's media. Please try again." };
  }

  const stored = rows.data ?? [];
  const urls = new Map<string, string>();
  if (stored.length > 0) {
    const { data, error } = await supabase.storage
      .from(EVENT_MEDIA_BUCKET)
      .createSignedUrls(
        stored.map((row) => row.storage_path),
        SIGNED_URL_TTL_SECONDS,
      );
    if (error) console.error("Could not sign event media URLs", error);
    for (const signed of data ?? []) {
      if (signed.path && signed.signedUrl) {
        urls.set(signed.path, signed.signedUrl);
      }
    }
  }

  return {
    data: {
      enabled: enabled.data === true,
      canUpload: canUpload.data === true,
      canDelete: hasPermission(permissions, "events", "manage"),
      eventBytes: Number(summary.data?.event_bytes ?? 0),
      tenantBytes: Number(summary.data?.tenant_bytes ?? 0),
      photoObjections: Number(summary.data?.photo_objections ?? 0),
      retentionDays:
        typeof retentionDays.data === "number" ? retentionDays.data : null,
      eventExpiresAt: eventExpiresAt.data ?? null,
      items: stored.map(({ storage_path, ...row }) => {
        const url = urls.get(storage_path) ?? null;
        return {
          ...row,
          kind: row.kind as EventMediaKind,
          url,
          download_url: url
            ? eventMediaDownloadUrl(url, row.original_filename)
            : null,
        };
      }),
    },
  };
}

/**
 * Deletes one photo or video (#1607): the stored object, then its row.
 *
 * events:manage, on the reader's own client, so the bucket's and the table's
 * delete policies decide. The object goes first: a row left pointing at
 * nothing shows as a broken tile and can be deleted again, whereas an object
 * with no row is invisible storage nobody can reach to remove.
 */
export async function deleteEventMediaAction(
  mediaId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to delete photos and videos.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "events",
    "manage",
    "You don't have permission to delete this event's photos and videos.",
  );
  if (permissionError) return permissionError;

  const { data: row, error: readError } = await supabase
    .from("event_media")
    .select("id, storage_path")
    .eq("id", String(mediaId))
    .maybeSingle();
  if (readError || !row) {
    return { error: "That photo or video is no longer here." };
  }

  const { error: removeError } = await supabase.storage
    .from(EVENT_MEDIA_BUCKET)
    .remove([row.storage_path]);
  if (removeError) {
    console.error("Could not remove the event media object", removeError);
    return { error: "Could not delete the file. Please try again." };
  }

  const { error: deleteError } = await supabase
    .from("event_media")
    .delete()
    .eq("id", row.id);
  if (deleteError) {
    console.error("Could not delete the event media row", deleteError);
    return { error: "Could not delete the file. Please try again." };
  }

  revalidatePath("/portal/events");
  return { ok: true };
}

/**
 * Signed upload tokens for a batch of picked files, one per file and in the
 * same order.
 *
 * Minted with the uploader's own session rather than the service role, so the
 * bucket's insert policy -- the event's staff or events:manage, the tenant's
 * setting on, never the demo -- is what decides. A photo's token takes one PUT
 * and a video's the resumable endpoint's `x-signature` header; both are good
 * for two hours.
 */
export async function createEventMediaUploadSlotsAction(
  eventId: string,
  files: { name: string; type: string; size: number }[],
): Promise<{ slots: EventMediaSlot[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to upload photos and videos.",
  );
  if ("error" in userResult) return userResult;

  // A Server Action's arguments are whatever the caller sent.
  if (!Array.isArray(files) || files.length === 0) return { slots: [] };
  if (files.length > MAX_FILES_PER_BATCH) {
    return {
      error: `Upload at most ${MAX_FILES_PER_BATCH} files at a time.`,
    };
  }
  const plans = [];
  for (const file of files) {
    const plan = planEventMediaFile({
      name: String(file?.name ?? ""),
      type: String(file?.type ?? ""),
      size: Number(file?.size ?? 0),
    });
    if ("error" in plan) return plan;
    plans.push(plan);
  }

  const [{ data: tenantId }, { data: allowed }, { data: enabled }] =
    await Promise.all([
      supabase.rpc("current_tenant_id"),
      supabase.rpc("can_upload_event_media", { p_event_id: eventId }),
      supabase.rpc("event_media_uploads_enabled"),
    ]);
  if (!tenantId || !allowed) {
    return {
      error:
        enabled === false
          ? "Event media uploads are turned off for this organization."
          : "You don't have permission to upload to this event.",
    };
  }

  const slots: EventMediaSlot[] = [];
  for (const plan of plans) {
    const path = eventMediaPath(tenantId, eventId, plan.extension);
    const { data, error } = await supabase.storage
      .from(EVENT_MEDIA_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      console.error("Could not mint an event media upload slot", error);
      return { error: "Uploads aren't available right now. Please try again." };
    }
    slots.push({
      path,
      token: data.token,
      kind: plan.kind,
      contentType: plan.contentType,
    });
  }
  return { slots };
}

/**
 * Records a finished upload. `record_event_media()` re-checks the uploader and
 * reads the size and type off the stored object, so nothing the browser says
 * about the file is stored as fact.
 */
export async function recordEventMediaAction(
  path: string,
  originalFilename: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to upload photos and videos.",
  );
  if ("error" in userResult) return userResult;

  const { error } = await supabase.rpc("record_event_media", {
    p_path: String(path),
    p_original_filename: String(originalFilename),
  });
  if (error) {
    console.error("Could not record the event media upload", error);
    return {
      error:
        error.message === "PERMISSION_DENIED"
          ? "You don't have permission to upload to this event."
          : error.message === "MEDIA_NOT_FOUND"
            ? "The upload didn't arrive. Try again."
            : "The file uploaded but couldn't be saved to the event. Try again.",
    };
  }

  revalidatePath("/portal/events");
  return { ok: true };
}

/**
 * Turns this organization's event photo and video uploads on or off (#1606).
 * Gated on events:manage and written through set_event_media_uploads_enabled(),
 * which checks it again: the setting lives with the feature, like
 * registration's under-18 questions.
 */
export async function updateEventMediaUploadsEnabledAction(
  enabled: boolean,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to change event settings.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const { error } = await supabase.rpc("set_event_media_uploads_enabled", {
    p_enabled: enabled === true,
  });
  if (error) {
    return {
      error:
        error.message === "PERMISSION_DENIED"
          ? "You don't have permission to change event settings."
          : "Could not save the setting. Please try again.",
    };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

/**
 * Sets how long this organization keeps event photos and videos after the
 * event (#1608), or null to keep them indefinitely. Gated on events:manage and
 * written through set_event_media_retention_days(), which checks it again and
 * holds the 30-day to 10-year range. Only the periods the sheet offers are
 * accepted here, so a hand-made call cannot pick an odd one.
 */
export async function updateEventMediaRetentionAction(
  days: number | null,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to change event settings.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  if (days !== null && !EVENT_MEDIA_RETENTION_PRESETS.includes(days)) {
    return { error: "Choose one of the listed periods." };
  }

  const { error } = await supabase.rpc("set_event_media_retention_days", {
    // Null is "indefinitely"; the generated type does not say it is nullable.
    p_days: days as number,
  });
  if (error) {
    return {
      error:
        error.message === "PERMISSION_DENIED"
          ? "You don't have permission to change event settings."
          : "Could not save the setting. Please try again.",
    };
  }

  revalidatePath("/portal/events");
  return { success: true };
}
