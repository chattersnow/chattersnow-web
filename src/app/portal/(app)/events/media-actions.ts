"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkUser } from "@/lib/auth/current-user";
import { checkPermission } from "@/lib/auth/permissions";
import {
  EVENT_MEDIA_BUCKET,
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
};

export type EventMediaState = {
  /** The tenant's Event media uploads setting. */
  enabled: boolean;
  /** Whether this reader may upload to this event right now. */
  canUpload: boolean;
  items: EventMediaRow[];
};

/** More than a phone's camera roll for one event is a second batch. */
const MAX_FILES_PER_BATCH = 100;

/**
 * The event's Media card (#1606): what has been uploaded, and whether the
 * upload control shows. Gated on events:view, like the bucket's read policy.
 */
export async function getEventMediaAction(
  eventId: string,
): Promise<{ data: EventMediaState } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "events", "view");
  if (permissionError) return permissionError;

  const [enabled, canUpload, rows] = await Promise.all([
    supabase.rpc("event_media_uploads_enabled"),
    supabase.rpc("can_upload_event_media", { p_event_id: eventId }),
    supabase
      .from("event_media")
      .select(
        "id, kind, original_filename, content_type, size_bytes, uploaded_at",
      )
      .eq("event_id", eventId)
      .order("uploaded_at", { ascending: false }),
  ]);

  if (rows.error) {
    return { error: "Could not load this event's media. Please try again." };
  }
  return {
    data: {
      enabled: enabled.data === true,
      canUpload: canUpload.data === true,
      items: (rows.data ?? []) as EventMediaRow[],
    },
  };
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
