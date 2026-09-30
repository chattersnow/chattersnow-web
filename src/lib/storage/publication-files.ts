import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  PUBLICATION_FILES_BUCKET,
  PUBLICATION_PDF_MAX_BYTES,
  renditionWidths,
  type Rendition,
} from "@/lib/publications";
import { encodeImageWidths } from "./compress-image";

/**
 * The editor's uploads into `publication-files` (#1472).
 *
 * Every image is resized in the browser to the widths in
 * `PUBLICATION_IMAGE_WIDTHS` and stored as WebP, for `site-photos.ts`'s reason:
 * Supabase's image transformations are Pro-only and this project is on Free,
 * and Vercel's optimizer is metered. The public page builds its `srcset` from
 * the stored widths with a plain `<img>`, so nothing is transformed per view.
 * The original scan is never stored -- a 24-page issue of phone photos would
 * otherwise be ~100 MB of a 1 GB budget.
 *
 * Objects go under `{tenant_id}/{publication_id}/`, the prefix the bucket's
 * policies check, each with a fresh UUID, so the bytes at a URL never change
 * and a year of cache is safe. A file picked and then abandoned is swept by
 * the daily orphan purge (`publication-purge.ts`) once it is a day old.
 */

/** A year: an object path is a fresh UUID, so there is nothing to revalidate. */
const CACHE_CONTROL_SECONDS = "31536000";

export type UploadedImage = {
  /** The widest stored copy: the page's `src` and its `width`/`height`. */
  path: string;
  width: number;
  height: number;
  /** Every stored copy, the widest included. */
  renditions: Rendition[];
};

export type UploadedPdf = { path: string; bytes: number };

export type UploadResult<T> = T | { error: string };

function statusOf(error: unknown): string {
  return String((error as { statusCode?: string | number }).statusCode);
}

function uploadError(error: unknown, what: string): { error: string } {
  console.error(`Could not upload the ${what}`, error);
  const status = statusOf(error);
  if (status === "413") return { error: `That ${what} is too large.` };
  if (status === "403") {
    return { error: `You don't have permission to upload a ${what} here.` };
  }
  return { error: `The ${what} could not be uploaded. Try again.` };
}

/**
 * Resizes one picked image to every width it can fill and uploads each copy.
 *
 * Never throws: a failure comes back as a sentence, and the copies already
 * sent are left for the orphan purge rather than deleted here, since a delete
 * that also failed would say nothing more useful.
 */
export async function uploadPublicationImage(
  file: File,
  folder: string,
): Promise<UploadResult<UploadedImage>> {
  let encoded;
  try {
    encoded = await encodeImageWidths(file, (width) => renditionWidths(width));
  } catch (error) {
    console.error("Could not read the selected image", error);
    return { error: `${file.name} could not be read as an image.` };
  }

  const supabase = createSupabaseBrowserClient();
  const id = crypto.randomUUID();
  const renditions: Rendition[] = [];
  for (const { blob, width } of encoded) {
    const extension = blob.type === "image/webp" ? "webp" : "jpg";
    const path = `${folder}/${id}-${width}.${extension}`;
    const { error } = await supabase.storage
      .from(PUBLICATION_FILES_BUCKET)
      .upload(path, blob, {
        contentType: blob.type,
        cacheControl: CACHE_CONTROL_SECONDS,
        upsert: false,
      });
    if (error) return uploadError(error, "image");
    renditions.push({ path, width });
  }

  const widest = encoded[encoded.length - 1];
  return {
    path: renditions[renditions.length - 1].path,
    width: widest.width,
    height: widest.height,
    renditions,
  };
}

/** Uploads a PDF as it is: a download, never re-encoded. */
export async function uploadPublicationPdf(
  file: File,
  folder: string,
): Promise<UploadResult<UploadedPdf>> {
  if (file.type !== "application/pdf") {
    return { error: `${file.name} is not a PDF.` };
  }
  if (file.size > PUBLICATION_PDF_MAX_BYTES) {
    return { error: `${file.name} is larger than 25 MB.` };
  }

  const supabase = createSupabaseBrowserClient();
  const path = `${folder}/${crypto.randomUUID()}.pdf`;
  const { error } = await supabase.storage
    .from(PUBLICATION_FILES_BUCKET)
    .upload(path, file, {
      contentType: "application/pdf",
      cacheControl: CACHE_CONTROL_SECONDS,
      upsert: false,
    });
  if (error) return uploadError(error, "PDF");
  return { path, bytes: file.size };
}

/** A stored object's public URL, for the editor's thumbnails. */
export function publicationFileUrl(path: string): string {
  return createSupabaseBrowserClient()
    .storage.from(PUBLICATION_FILES_BUCKET)
    .getPublicUrl(path).data.publicUrl;
}
