import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { compressImage } from "./compress-image";

/** The bucket created by 20260921050000. Public read, RLS-gated write. */
export const SITE_PHOTOS_BUCKET = "site-photos";

/**
 * Longest edge of a stored site photo, in pixels.
 *
 * Larger than a gear photo's 1600. Seven image slots are cropped to 21/9 and
 * twenty to 16/9, so a site photo is a band across the full width of a desktop
 * hero rather than a thumbnail in a list, and 1600px is visibly thin there on
 * a high-density display. At q0.8 this lands around 400-700 KB, so a tenant's
 * whole set of forty-six slots is roughly 28 MB against Supabase Free's 1 GB.
 *
 * The resize happens in the browser because it has to: Supabase's own image
 * transformations are a Pro-plan feature, and this project is on Free.
 */
export const SITE_PHOTO_MAX_EDGE = 2400;

/**
 * How long a stored site photo may be cached, in seconds.
 *
 * A year, because the object path is a fresh UUID -- the bytes at a given URL
 * never change, so there is nothing to revalidate. Supabase defaults this to
 * an hour, and Next 16 raises anything shorter to its own `minimumCacheTTL` of
 * four hours: roughly 46 slots x 3 widths x 6 revalidations a day, which is
 * about 25k Vercel image transformations a month against Hobby's 5,000. With a
 * year it collapses to a one-time transformation per slot and width (#921).
 */
const CACHE_CONTROL_SECONDS = 31536000;

/**
 * The `{tenant}/{uuid}.jpg` object path inside a public site-photo URL, or
 * null for anything that isn't one (a Google Drive link, a root-relative site
 * image, an empty value).
 *
 * Matches on the path after the bucket segment rather than on the whole URL:
 * the origin differs between the local stack, the hosted project and a custom
 * domain, so full-URL equality would treat every uploaded photo as
 * unrecognized.
 *
 * The value may carry a `#crop=` fragment (`src/lib/image-crop.ts`). `URL`
 * parses that off into `.hash` for us, so the path comes back clean.
 */
export function sitePhotoPathFromUrl(url: string | null): string | null {
  if (!url) return null;

  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }

  const marker = `/${SITE_PHOTOS_BUCKET}/`;
  const at = pathname.indexOf(marker);
  if (at === -1) return null;

  return pathname.slice(at + marker.length) || null;
}

export type SitePhotoUploadResult =
  { url: string; path: string } | { error: string };

const GENERIC_UPLOAD_ERROR =
  "The photo could not be uploaded. Try again, or paste a link instead.";

/**
 * Compresses and uploads one site photo to `path`, returning its public URL.
 *
 * Never throws: the caller is a slot in a form the editor is part-way through,
 * so every failure comes back as a sentence they can act on. The underlying
 * error is logged rather than shown -- a storage 403 says nothing useful to
 * the person who picked the file.
 *
 * `path` comes from `createSitePhotoPathAction()`, which is where the tenant
 * prefix is decided. The storage policies are what actually enforce it; the
 * action exists so a refusal arrives before the upload rather than after it.
 */
export async function uploadSitePhoto(
  file: File,
  path: string,
): Promise<SitePhotoUploadResult> {
  let body: Blob;
  try {
    body = await compressImage(file, SITE_PHOTO_MAX_EDGE);
  } catch (error) {
    console.error("Could not read the selected image", error);
    return {
      error:
        "That image could not be read. Try another file, or paste a link instead.",
    };
  }

  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.storage
    .from(SITE_PHOTOS_BUCKET)
    .upload(path, body, {
      contentType: "image/jpeg",
      cacheControl: String(CACHE_CONTROL_SECONDS),
      upsert: false,
    });

  if (error) {
    console.error("Could not upload the site photo", error);
    const status = String(
      (error as { statusCode?: string | number }).statusCode,
    );
    if (status === "413") return { error: "That photo is too large." };
    if (status === "403") {
      return { error: "You don't have permission to add site photos." };
    }
    return { error: GENERIC_UPLOAD_ERROR };
  }

  const { data } = supabase.storage.from(SITE_PHOTOS_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) return { error: GENERIC_UPLOAD_ERROR };

  return { url: data.publicUrl, path };
}

/**
 * Best-effort removal of an object this editing session uploaded and then
 * replaced before saving.
 *
 * Deliberately swallows its error and returns void: a failed cleanup must
 * never block the form.
 *
 * Only ever called for a path uploaded during the current session -- never for
 * one that arrived as the slot's stored value. `site_content` carries a draft
 * value *and* a published one, so a photo the editor has just replaced on
 * screen may still be the picture the live site is serving to visitors; a
 * stale object costs a few hundred kilobytes, and deleting a live one takes
 * the picture off the website.
 */
export async function deleteSitePhoto(path: string): Promise<void> {
  try {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.storage
      .from(SITE_PHOTOS_BUCKET)
      .remove([path]);
    if (error)
      console.error("Could not remove the discarded site photo", error);
  } catch (error) {
    console.error("Could not remove the discarded site photo", error);
  }
}
