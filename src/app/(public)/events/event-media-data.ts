import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSite } from "@/lib/public-site";
import { EVENT_MEDIA_BUCKET } from "@/lib/storage/event-media-files";
import {
  EMPTY_PUBLIC_EVENT_MEDIA,
  PUBLIC_EVENT_MEDIA_TTL_SECONDS,
  buildPublicEventMedia,
  publicEventMediaToSign,
  type PublicEventMedia,
  type PublicEventMediaRow,
} from "@/lib/public-event-gallery";

/**
 * An event's public photos and videos (#1654), signed for this request.
 *
 * The bucket has no anon policy, so the service-role client reads the rows
 * and signs them -- for the tenant the request host resolved to, which
 * `public_event_media()` checks the event against along with its visibility,
 * its status and the tenant's Public event gallery setting. Only the signed
 * URLs leave the server. `photoLimit` previews the newest photos; null is the
 * whole gallery.
 */
export async function loadPublicEventMedia(
  eventId: string,
  photoLimit: number | null,
): Promise<PublicEventMedia> {
  const { tenant } = await getPublicSite(await createSupabaseServerClient());
  if (!tenant) return EMPTY_PUBLIC_EVENT_MEDIA;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("public_event_media", {
    p_tenant_id: tenant.id,
    p_event_id: eventId,
  });
  if (error) {
    console.error("Could not read the event's public media", error);
    return EMPTY_PUBLIC_EVENT_MEDIA;
  }

  const rows = (data ?? []) as PublicEventMediaRow[];
  const { photos, videos } = publicEventMediaToSign(rows, photoLimit);
  const paths = [...photos, ...videos].map((row) => row.path);
  const urls = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed, error: signError } = await admin.storage
      .from(EVENT_MEDIA_BUCKET)
      .createSignedUrls(paths, PUBLIC_EVENT_MEDIA_TTL_SECONDS);
    if (signError)
      console.error("Could not sign public event media", signError);
    for (const item of signed ?? []) {
      if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
    }
  }

  return buildPublicEventMedia(rows, photoLimit, urls);
}
