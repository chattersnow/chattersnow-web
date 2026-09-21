import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { compressImage } from "./compress-image";

/** The bucket created by 20260907160000. Public read, RLS-gated write. */
export const GEAR_PHOTOS_BUCKET = "gear-photos";

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
