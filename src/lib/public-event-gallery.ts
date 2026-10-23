/**
 * An event's public gallery (#1654): the photos and videos of a public,
 * published event that are marked public, while the organization's Public
 * event gallery is on. `public_event_media()` decides which rows; this decides
 * what of them a page shows. Pure, so it is tested without a database.
 */

/** How many of the newest photos the event page previews. */
export const PUBLIC_EVENT_PHOTO_PREVIEW = 8;

/**
 * An hour, as in the portal (#1607). The pages render on every request, so a
 * hidden photo leaves the next one; a URL already handed out lasts this long.
 */
export const PUBLIC_EVENT_MEDIA_TTL_SECONDS = 60 * 60;

/** A row of `public_event_media()`: the path to sign, never who sent it. */
export type PublicEventMediaRow = {
  id: string;
  kind: string;
  path: string;
  content_type: string;
  caption: string | null;
  uploaded_at: string;
};

export type PublicEventPhoto = {
  id: string;
  url: string;
  caption: string | null;
};

export type PublicEventVideo = {
  id: string;
  url: string;
  caption: string | null;
};

export type PublicEventMedia = {
  photos: PublicEventPhoto[];
  videos: PublicEventVideo[];
  /** Every public photo, including those past a preview's limit. */
  photoCount: number;
};

export const EMPTY_PUBLIC_EVENT_MEDIA: PublicEventMedia = {
  photos: [],
  videos: [],
  photoCount: 0,
};

/**
 * Which rows to sign: the newest `photoLimit` photos (all of them when null)
 * and every video. The rows arrive newest first.
 */
export function publicEventMediaToSign(
  rows: PublicEventMediaRow[],
  photoLimit: number | null,
): {
  photos: PublicEventMediaRow[];
  videos: PublicEventMediaRow[];
  photoCount: number;
} {
  const allPhotos = rows.filter((row) => row.kind === "photo");
  return {
    photos: photoLimit === null ? allPhotos : allPhotos.slice(0, photoLimit),
    videos: rows.filter((row) => row.kind === "video"),
    photoCount: allPhotos.length,
  };
}

/**
 * The page's media once signed. A path that did not sign is left out rather
 * than shown broken; the count stays what the database says.
 */
export function buildPublicEventMedia(
  rows: PublicEventMediaRow[],
  photoLimit: number | null,
  urls: ReadonlyMap<string, string>,
): PublicEventMedia {
  const { photos, videos, photoCount } = publicEventMediaToSign(
    rows,
    photoLimit,
  );
  return {
    photos: photos.flatMap((row) => {
      const url = urls.get(row.path);
      return url ? [{ id: row.id, url, caption: row.caption }] : [];
    }),
    videos: videos.flatMap((row) => {
      const url = urls.get(row.path);
      return url ? [{ id: row.id, url, caption: row.caption }] : [];
    }),
    photoCount,
  };
}

export function hasPublicEventMedia(media: PublicEventMedia): boolean {
  return media.photos.length > 0 || media.videos.length > 0;
}

/** A photo's alt text: its caption, else its place in the event's photos. */
export function publicEventPhotoAlt(
  eventName: string,
  index: number,
  total: number,
  caption: string | null,
): string {
  return caption?.trim() || `Photo ${index + 1} of ${total} from ${eventName}`;
}
