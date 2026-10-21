"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/get-client-ip";
import {
  hashConfirmationToken,
  isConfirmationToken,
  mintConfirmationToken,
} from "@/lib/notifications/notification-email-token";
import {
  UPLOAD_LINK_INVALID,
  uploadLinkError,
} from "@/lib/event-media-upload-links";
import {
  EVENT_MEDIA_BUCKET,
  eventMediaPath,
  eventMediaThumbPath,
  planEventMediaFile,
  type EventMediaSlot,
} from "@/lib/storage/event-media-files";

/** More than a camera card's worth for one event is a second batch. */
const MAX_FILES_PER_BATCH = 100;

const UNAVAILABLE = "Uploads aren't available right now. Please try again.";

/**
 * Signed upload tokens for a batch of files picked on an upload link's page
 * (#1620), one per file in the same order, plus a thumbnail slot per photo.
 *
 * The public site's second use of the service-role client, for the reason
 * `createArtworkUploadSlotsAction` gives: a 10 GB video cannot go through a
 * Server Action, and an `anon` insert policy on storage.objects would be an
 * unauthenticated write faucet. So `claim_event_media_link_upload_slots` does
 * the load-bearing work -- rate limit, live link, byte cap -- and hands back
 * the tenant and event; the paths are minted here, and nothing the caller sent
 * reaches one.
 */
export async function createLinkUploadSlotsAction(
  token: string,
  files: { name: string; type: string; size: number }[],
): Promise<{ slots: EventMediaSlot[] } | { error: string }> {
  if (!isConfirmationToken(String(token)))
    return { error: UPLOAD_LINK_INVALID };
  if (!Array.isArray(files) || files.length === 0) return { slots: [] };
  if (files.length > MAX_FILES_PER_BATCH) {
    return { error: `Upload at most ${MAX_FILES_PER_BATCH} files at a time.` };
  }

  const plans = [];
  let bytes = 0;
  for (const file of files) {
    const size = Number(file?.size ?? 0);
    const plan = planEventMediaFile(
      { name: String(file?.name ?? ""), type: String(file?.type ?? ""), size },
      { keepOriginals: true },
    );
    if ("error" in plan) return plan;
    plans.push(plan);
    bytes += Number.isFinite(size) && size > 0 ? size : 0;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .rpc("claim_event_media_link_upload_slots", {
      p_token_hash: hashConfirmationToken(token),
      p_count: plans.length,
      p_bytes: bytes,
      p_ip_address: await getClientIp(),
    })
    .maybeSingle();
  if (error || !data) {
    return { error: uploadLinkError(error?.message ?? "", UNAVAILABLE) };
  }

  const admin = createSupabaseAdminClient();
  const slots: EventMediaSlot[] = [];
  for (const plan of plans) {
    const path = eventMediaPath(data.tenant_id, data.event_id, plan.extension);
    const original = await admin.storage
      .from(EVENT_MEDIA_BUCKET)
      .createSignedUploadUrl(path);
    const thumb =
      plan.kind === "photo"
        ? await admin.storage
            .from(EVENT_MEDIA_BUCKET)
            .createSignedUploadUrl(eventMediaThumbPath(path))
        : null;
    if (original.error || thumb?.error) {
      console.error(
        "Could not mint an event media link upload slot",
        original.error ?? thumb?.error,
      );
      return { error: UNAVAILABLE };
    }
    slots.push({
      path,
      token: original.data.token,
      kind: plan.kind,
      contentType: plan.contentType,
      ...(thumb?.data ? { thumbToken: thumb.data.token } : {}),
    });
  }
  return { slots };
}

/**
 * Records a finished upload through a link. `record_event_media_by_link()`
 * re-checks the link and the path and reads size and type off the stored
 * object. The receipt minted here is what lets this page take the file back
 * (decided on #1620): only its hash is stored, and the raw value goes back to
 * the page's memory as `{media id}.{receipt}`.
 */
export async function recordLinkUploadAction(
  token: string,
  path: string,
  originalFilename: string,
  rightsConfirmed: boolean,
): Promise<{ ok: true; ref: string } | { error: string }> {
  if (!isConfirmationToken(String(token)))
    return { error: UPLOAD_LINK_INVALID };

  const receipt = mintConfirmationToken();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("record_event_media_by_link", {
    p_token_hash: hashConfirmationToken(token),
    p_path: String(path),
    p_original_filename: String(originalFilename),
    p_rights_confirmed: rightsConfirmed === true,
    p_receipt_hash: receipt.hash,
    p_ip_address: await getClientIp(),
  });
  if (error || !data) {
    console.error("Could not record an event media link upload", error);
    return {
      error: uploadLinkError(
        error?.message ?? "",
        "The file uploaded but couldn't be saved. Try again.",
      ),
    };
  }
  return { ok: true, ref: `${data}.${receipt.token}` };
}

/**
 * Takes back a file this page uploaded (#1620): the row through
 * `delete_event_media_by_link()`, which needs the receipt, then its objects on
 * the service-role client. An object that fails to go is an orphan the daily
 * sweep collects, so the uploader is not told about it.
 */
export async function deleteLinkUploadAction(
  token: string,
  ref: string,
): Promise<{ ok: true } | { error: string }> {
  const [mediaId, receipt] = String(ref).split(".");
  if (
    !isConfirmationToken(String(token)) ||
    !mediaId ||
    !receipt ||
    !isConfirmationToken(receipt)
  ) {
    return { error: "That file can't be deleted from here." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("delete_event_media_by_link", {
    p_token_hash: hashConfirmationToken(token),
    p_media_id: mediaId,
    p_receipt_hash: hashConfirmationToken(receipt),
    p_ip_address: await getClientIp(),
  });
  if (error) {
    return {
      error: error.message.includes("MEDIA_NOT_FOUND")
        ? "That file can't be deleted from here. Ask whoever sent the link to remove it."
        : uploadLinkError(
            error.message,
            "Could not delete the file. Try again.",
          ),
    };
  }

  const paths = (data ?? []).flatMap((row) =>
    [row.storage_path, row.thumb_path].filter((path): path is string => !!path),
  );
  if (paths.length > 0) {
    const { error: removeError } = await createSupabaseAdminClient()
      .storage.from(EVENT_MEDIA_BUCKET)
      .remove(paths);
    if (removeError) {
      console.error("Could not remove a link upload's objects", removeError);
    }
  }
  return { ok: true };
}
