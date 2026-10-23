/**
 * An event's public gallery (#1654): the photos and videos of a public,
 * published event that are marked public, while the organization's Public
 * event gallery is on. `public_event_media()` decides which rows; this decides
 * what of them a page shows. Pure, so it is tested without a database.
 */

/** How many of the newest photos the event page previews. */
export const PUBLIC_EVENT_PHOTO_PREVIEW = 8;

/**
 * Photos per gallery page (#1683), the first the default. Each a multiple of
 * the grid's four columns, so a full page ends on a full row.
 */
export const PUBLIC_EVENT_PHOTO_PAGE_SIZES = [20, 60, 120] as const;

/**
 * An hour, as in the portal (#1607). The pages read their rows on every
 * request, so a hidden photo leaves the next one; a URL already handed out
 * lasts this long.
 */
export const PUBLIC_EVENT_MEDIA_TTL_SECONDS = 60 * 60;

/**
 * How long a signed URL is reused across requests (#1683): the same URL on a
 * revisit is what lets the browser's image cache answer instead of
 * downloading the photo again. Half the TTL, so a reused URL always has at
 * least half an hour left.
 */
export const PUBLIC_EVENT_MEDIA_REUSE_SECONDS =
  PUBLIC_EVENT_MEDIA_TTL_SECONDS / 2;

/**
 * Which photos a page shows: `limit` of them from `offset`, newest first.
 * Videos ride with the first page (offset 0), so they are not repeated on
 * every page of a long gallery.
 */
export type PublicEventPhotoWindow = { offset: number; limit: number };

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
  /** Every public photo, including those outside this page or preview. */
  photoCount: number;
  /** How many newer photos come before `photos[0]`. */
  photoOffset: number;
};

export const EMPTY_PUBLIC_EVENT_MEDIA: PublicEventMedia = {
  photos: [],
  videos: [],
  photoCount: 0,
  photoOffset: 0,
};

/**
 * Which rows to sign: the window's photos, and every video when the window is
 * the first page. The rows arrive newest first.
 */
export function publicEventMediaToSign(
  rows: PublicEventMediaRow[],
  window: PublicEventPhotoWindow,
): {
  photos: PublicEventMediaRow[];
  videos: PublicEventMediaRow[];
  photoCount: number;
} {
  const allPhotos = rows.filter((row) => row.kind === "photo");
  return {
    photos: allPhotos.slice(window.offset, window.offset + window.limit),
    videos:
      window.offset === 0 ? rows.filter((row) => row.kind === "video") : [],
    photoCount: allPhotos.length,
  };
}

/**
 * The page's media once signed. A path that did not sign is left out rather
 * than shown broken; the count stays what the database says.
 */
export function buildPublicEventMedia(
  rows: PublicEventMediaRow[],
  window: PublicEventPhotoWindow,
  urls: ReadonlyMap<string, string>,
): PublicEventMedia {
  const { photos, videos, photoCount } = publicEventMediaToSign(rows, window);
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
    photoOffset: window.offset,
  };
}

/** The start of the time bucket a signed URL issued at `nowMs` is reused in. */
export function publicEventMediaReuseBucket(nowMs: number): number {
  const bucketMs = PUBLIC_EVENT_MEDIA_REUSE_SECONDS * 1000;
  return Math.floor(nowMs / bucketMs) * bucketMs;
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
