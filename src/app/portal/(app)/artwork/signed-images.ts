import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ARTWORK_BUCKET } from "@/lib/storage/artwork-submissions";
import type {
  ArtworkSubmissionImage,
  SignedArtworkImage,
} from "./submission-types";

/** An hour. Long enough to work through a queue, short enough that a copied
 * URL is not a way to hand the artwork on. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Attaches a signed URL to every image on the page, in one round trip.
 *
 * On the caller's own client rather than the service-role one: the bucket's
 * select policy is what decides whether these resolve, so a reader without
 * `artwork_submissions:view` gets nothing here rather than being trusted to
 * have been stopped upstream.
 *
 * A path that fails to sign comes back null rather than throwing. One
 * unreadable object -- an upload abandoned halfway, a row whose bytes the
 * purge already took -- must not empty the whole queue.
 */
export async function signArtworkImages(
  supabase: SupabaseClient,
  images: ArtworkSubmissionImage[],
): Promise<Map<string, SignedArtworkImage>> {
  const signed = new Map<string, SignedArtworkImage>();
  if (images.length === 0) return signed;

  const paths = images.flatMap((image) => [
    image.storage_path,
    image.thumb_path,
  ]);
  const { data, error } = await supabase.storage
    .from(ARTWORK_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  const urls = new Map<string, string>();
  if (error) {
    console.error("Could not sign artwork image URLs", error);
  } else {
    for (const row of data ?? []) {
      if (row.path && row.signedUrl) urls.set(row.path, row.signedUrl);
    }
  }

  for (const image of images) {
    signed.set(image.id, {
      ...image,
      thumbUrl: urls.get(image.thumb_path) ?? null,
      originalUrl: urls.get(image.storage_path) ?? null,
    });
  }
  return signed;
}
