import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/** The bucket created by 20260907160000. Public read, RLS-gated write. */
export const GEAR_PHOTOS_BUCKET = "gear-photos";

/** Longest edge of a stored photo, in pixels. */
export const MAX_EDGE = 1600;

/** JPEG quality for the re-encode. 1600px at 0.8 lands around 250 KB. */
export const JPEG_QUALITY = 0.8;

/**
 * The pure half of `compressImage`, split out so the sizing rules can be tested
 * without a canvas.
 *
 * Scales the longest edge down to `maxEdge` and never up -- a photo already
 * smaller than the cap is re-encoded at its own size rather than blown up into
 * a bigger file with no more detail. Every result is at least 1px on each side,
 * because a canvas of zero width throws.
 */
export function targetDimensions(
  width: number,
  height: number,
  maxEdge: number = MAX_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  const scale = longest <= maxEdge ? 1 : maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * The `{tenant}/{uuid}.jpg` object path inside a public gear-photo URL, or null
 * for anything that isn't one (a Google Drive link, a root-relative site image,
 * an empty value).
 *
 * Matches on the path after the bucket segment rather than on the whole URL:
 * the origin differs between the local stack, the hosted project and a custom
 * domain, so full-URL equality would treat every stored photo as unrecognized —
 * which, in the purge job, would mean deleting all of them.
 */
export function gearPhotoPathFromUrl(url: string | null): string | null {
  if (!url) return null;

  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }

  const marker = `/${GEAR_PHOTOS_BUCKET}/`;
  const at = pathname.indexOf(marker);
  if (at === -1) return null;

  return pathname.slice(at + marker.length) || null;
}

/**
 * Re-encodes a picked image to a JPEG no larger than `MAX_EDGE` on its longest
 * edge.
 *
 * `imageOrientation: "from-image"` is not optional. Phone photos carry their
 * rotation in EXIF rather than in the pixels, and `drawImage` of a raw bitmap
 * ignores it -- without this a large share of intake photos would be stored
 * sideways permanently, with no way for the volunteer to tell at capture time.
 * The dimensions are read off the bitmap afterwards for the same reason: a
 * rotated photo's width and height are swapped relative to the file.
 *
 * Decoding through the browser also normalizes iPhone HEIC into JPEG for free,
 * which is why there is no `heic2any` dependency here.
 *
 * Throws if the image cannot be decoded. That failure is deliberately not
 * caught into "upload the original instead": the bucket's allowed_mime_types
 * would refuse a HEIC with a far worse message, and a 12 MP original would blow
 * the 5 MiB cap.
 */
export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    const { width, height } = targetDimensions(bitmap.width, bitmap.height);

    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No 2d canvas context");
      context.drawImage(bitmap, 0, 0, width, height);
      return await canvas.convertToBlob({
        type: "image/jpeg",
        quality: JPEG_QUALITY,
      });
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No 2d canvas context");
    context.drawImage(bitmap, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("Canvas produced no blob")),
        "image/jpeg",
        JPEG_QUALITY,
      );
    });
  } finally {
    bitmap.close();
  }
}

export type UploadResult = { url: string; path: string } | { error: string };

const GENERIC_UPLOAD_ERROR =
  "The photo could not be uploaded. Try again, or paste a link instead.";

/**
 * Compresses and uploads one photo to `path`, returning its public URL.
 *
 * Never throws: the caller is a form field mid-entry, so every failure comes
 * back as a sentence a volunteer can act on. The underlying error is logged
 * rather than shown -- a storage 403 says nothing useful to the person holding
 * the phone.
 *
 * `path` comes from `createGearPhotoPathAction()`, which is where the tenant
 * prefix is decided. The storage policies are what actually enforce it; the
 * action exists so a refusal arrives before the upload rather than after it.
 */
export async function uploadGearPhoto(
  file: File,
  path: string,
): Promise<UploadResult> {
  let body: Blob;
  try {
    body = await compressImage(file);
  } catch (error) {
    console.error("Could not read the selected image", error);
    return {
      error:
        "That image could not be read. Try a photo from your library, or paste a link instead.",
    };
  }

  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.storage
    .from(GEAR_PHOTOS_BUCKET)
    .upload(path, body, { contentType: "image/jpeg", upsert: false });

  if (error) {
    console.error("Could not upload the gear photo", error);
    const status = String(
      (error as { statusCode?: string | number }).statusCode,
    );
    if (status === "413") return { error: "That photo is too large." };
    if (status === "403") {
      return { error: "You don't have permission to add photos." };
    }
    return { error: GENERIC_UPLOAD_ERROR };
  }

  const { data } = supabase.storage.from(GEAR_PHOTOS_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) return { error: GENERIC_UPLOAD_ERROR };

  return { url: data.publicUrl, path };
}

/**
 * Best-effort removal of an object this session uploaded and then discarded.
 *
 * Deliberately swallows its error and returns void: a failed cleanup must never
 * block the form the user is filling in, and the daily purge job
 * (`runGearPhotoPurge`) sweeps anything left behind.
 *
 * Only ever called for a path uploaded during the current editing session --
 * never for one that arrived as an item's persisted `photo_url`. A persisted
 * URL may be shared by more than one row, and a live gear-library photo deleted
 * out from under a listing is a much worse outcome than a stale object, which
 * has a reaper.
 */
export async function deleteGearPhoto(path: string): Promise<void> {
  try {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.storage
      .from(GEAR_PHOTOS_BUCKET)
      .remove([path]);
    if (error)
      console.error("Could not remove the discarded gear photo", error);
  } catch (error) {
    console.error("Could not remove the discarded gear photo", error);
  }
}
