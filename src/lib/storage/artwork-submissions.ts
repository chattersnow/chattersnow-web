import { compressImage } from "./compress-image";
import { putToSignedUrl } from "./signed-upload";

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
 * `onProgress` tracks the original only. The thumbnail is a couple of hundred
 * kilobytes against as much as ten megabytes, so folding it into one figure
 * would buy a percentage point of accuracy at the cost of a bar that jumps.
 *
 * Never throws. The caller is a form mid-entry, so every failure comes back as
 * a sentence naming the file it happened to -- a batch of three that loses its
 * second file has to say which one. The underlying storage error is logged
 * instead, because a 403 from storage-api says nothing to the person who picked
 * it.
 */
export async function uploadArtwork(
  file: File,
  slot: ArtworkUploadSlot,
  onProgress?: (fraction: number) => void,
): Promise<ArtworkUploadResult> {
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

  const thumbUpload = await putToSignedUrl(
    ARTWORK_BUCKET,
    slot.thumbPath,
    slot.thumbToken,
    thumb,
  );
  if (!("ok" in thumbUpload)) {
    console.error(
      "Could not upload the artwork preview",
      slot.thumbPath,
      thumbUpload.status,
    );
    return { error: uploadErrorFor(file.name, thumbUpload.status) };
  }

  const upload = await putToSignedUrl(
    ARTWORK_BUCKET,
    slot.path,
    slot.token,
    file,
    onProgress,
  );
  if (!("ok" in upload)) {
    console.error("Could not upload the artwork", slot.path, upload.status);
    return { error: uploadErrorFor(file.name, upload.status) };
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

/** Always names the file: one of three that failed needs to be identifiable. */
function uploadErrorFor(fileName: string, status: number): string {
  if (status === 413) return `${fileName} is larger than 10 MB.`;
  return `${fileName} could not be uploaded. Check your connection and try again.`;
}
