import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { compressImage } from "./gear-photos";

/**
 * The bucket created by 20260909040000. Private, and with no `anon` policy on
 * it at all -- every write arrives through a signed upload URL that
 * `createArtworkUploadSlotsAction` mints with the service-role client, and
 * every read through a short-lived signed URL minted in a portal page behind a
 * permission check.
 */
export const ARTWORK_BUCKET = "artwork-submissions";

/** Per-image cap, matching the bucket's own `file_size_limit`. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Matching the bucket's `allowed_mime_types`. */
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** One image's two object paths and their one-shot upload tokens. */
export type ArtworkUploadSlot = {
  path: string;
  token: string;
  thumbPath: string;
  thumbToken: string;
};

/** What `submit_artwork` is given for each uploaded image. */
export type UploadedArtwork = {
  path: string;
  thumbPath: string;
  contentType: string;
  byteSize: number;
};

export type ArtworkUploadResult =
  { image: UploadedArtwork } | { error: string };

const GENERIC_UPLOAD_ERROR =
  "That image could not be uploaded. Check your connection and try again.";

/** The file extension the server must have used when it minted `path`. */
export function extensionForType(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

/**
 * Rejects a picked file before anything is encoded or sent.
 *
 * Advisory only -- the bucket's own `allowed_mime_types` and `file_size_limit`
 * are what actually refuse a bad upload, and `submit_artwork` re-checks the
 * content type before it records a row. This exists so the artist is told in
 * the file picker rather than after a 10 MB round trip.
 */
export function checkArtworkFile(file: File): string | null {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return `${file.name} is not a JPEG, PNG or WebP.`;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `${file.name} is larger than 10 MB.`;
  }
  return null;
}

/**
 * Uploads one artwork twice: the original untouched, and a compressed preview.
 *
 * The original is stored as picked because the zine is *printed* -- the 1600px
 * q0.8 JPEG that `compressImage` produces is a review thumbnail and nothing
 * more. The thumbnail is not an optimization either: a review grid of thirty
 * submissions would otherwise pull close to a gigabyte of egress on every load,
 * against a 5 GB free-tier month.
 *
 * Never throws. The caller is a form mid-entry, so every failure comes back as
 * a sentence; the underlying storage error is logged instead, because a 403
 * from storage-api says nothing useful to the person who picked the file.
 */
export async function uploadArtwork(
  file: File,
  slot: ArtworkUploadSlot,
): Promise<ArtworkUploadResult> {
  const supabase = createSupabaseBrowserClient();

  // Thumbnail first. It is the half that can fail on a browser that cannot
  // decode the image, and failing here costs one small encode rather than a
  // full-size upload that then has to be cleaned up.
  let thumb: Blob;
  try {
    thumb = await compressImage(file);
  } catch (error) {
    console.error("Could not read the selected artwork", error);
    return {
      error: `${file.name} could not be read. Try exporting it as a JPEG or PNG first.`,
    };
  }

  const thumbUpload = await supabase.storage
    .from(ARTWORK_BUCKET)
    .uploadToSignedUrl(slot.thumbPath, slot.thumbToken, thumb, {
      contentType: "image/jpeg",
    });
  if (thumbUpload.error) {
    console.error("Could not upload the artwork preview", thumbUpload.error);
    return { error: GENERIC_UPLOAD_ERROR };
  }

  const upload = await supabase.storage
    .from(ARTWORK_BUCKET)
    .uploadToSignedUrl(slot.path, slot.token, file, {
      contentType: file.type,
    });
  if (upload.error) {
    console.error("Could not upload the artwork", upload.error);
    const status = String(
      (upload.error as { statusCode?: string | number }).statusCode,
    );
    if (status === "413")
      return { error: `${file.name} is larger than 10 MB.` };
    return { error: GENERIC_UPLOAD_ERROR };
  }

  return {
    image: {
      path: slot.path,
      thumbPath: slot.thumbPath,
      contentType: file.type,
      byteSize: file.size,
    },
  };
}
