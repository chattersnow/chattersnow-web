/**
 * The private `event-media` bucket created by 20261020120000 (#1606).
 *
 * Photos are re-encoded in the browser and go up in one request; videos go up
 * by resumable (TUS) upload, because a phone records 100-400 MB a minute and a
 * single request that drops at 90% would start again from nothing. Both go to
 * a signed upload token minted with the uploader's own session, so the
 * bucket's insert policy decides who may upload.
 */
export const EVENT_MEDIA_BUCKET = "event-media";

/** Matching the bucket's own `file_size_limit`: 10 GiB. */
export const EVENT_MEDIA_MAX_BYTES = 10 * 1024 * 1024 * 1024;

/** Longest edge of a stored photo: full-screen on a laptop, a few hundred KB. */
export const EVENT_PHOTO_MAX_EDGE = 2048;

/** Supabase's resumable endpoint takes exactly 6 MB chunks. */
export const TUS_CHUNK_SIZE = 6 * 1024 * 1024;

export type EventMediaKind = "photo" | "video";

export type EventMediaContentType =
  "video/mp4" | "video/quicktime" | "video/webm" | "image/jpeg" | "image/webp";

const VIDEO_TYPES: Record<string, EventMediaContentType> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

const EXTENSIONS: Record<EventMediaContentType, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "heic",
  "heif",
]);

/** What a picked file will be stored as. */
export type EventMediaPlan = {
  kind: EventMediaKind;
  contentType: EventMediaContentType;
  extension: string;
};

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/**
 * What a picked file will be stored as, or why it can't be.
 *
 * Read from the declared type and, where a browser leaves that blank (a .mov
 * on Windows, HEIC almost everywhere), the extension. A photo is stored as
 * WebP when it was a PNG or WebP -- `compressImage` keeps transparency that
 * way -- and as JPEG otherwise, HEIC included. Advisory: the bucket's
 * `allowed_mime_types` and `file_size_limit` are what refuse, and the server
 * action runs this again before minting a token.
 */
export function planEventMediaFile(
  file: Pick<File, "name" | "type" | "size">,
): EventMediaPlan | { error: string } {
  const extension = extensionOf(file.name);
  const type = file.type.toLowerCase();

  const videoType = (Object.values(VIDEO_TYPES) as string[]).includes(type)
    ? (type as EventMediaContentType)
    : type === "" || type === "application/octet-stream"
      ? VIDEO_TYPES[extension]
      : undefined;
  if (videoType) {
    if (file.size > EVENT_MEDIA_MAX_BYTES) {
      return { error: `${file.name} is larger than 10 GB.` };
    }
    return {
      kind: "video",
      contentType: videoType,
      extension: EXTENSIONS[videoType],
    };
  }

  if (
    type.startsWith("image/") ||
    ((type === "" || type === "application/octet-stream") &&
      IMAGE_EXTENSIONS.has(extension))
  ) {
    const keepsAlpha =
      type === "image/png" ||
      type === "image/webp" ||
      extension === "png" ||
      extension === "webp";
    const contentType = keepsAlpha ? "image/webp" : "image/jpeg";
    return { kind: "photo", contentType, extension: EXTENSIONS[contentType] };
  }

  if (type.startsWith("video/")) {
    return {
      error: `${file.name} is a video format that can't be played here. Use MP4, MOV or WebM.`,
    };
  }
  return { error: `${file.name} is not a photo or a video.` };
}

/** A signed upload slot minted by `createEventMediaUploadSlotsAction`. */
export type EventMediaSlot = {
  path: string;
  token: string;
  kind: EventMediaKind;
  contentType: EventMediaContentType;
};

/**
 * `{tenant uuid}/{event uuid}/{uuid}.{ext}` -- the shape the bucket's policy
 * and `event_media_path_event_id()` accept.
 */
export function eventMediaPath(
  tenantId: string,
  eventId: string,
  extension: string,
): string {
  return `${tenantId}/${eventId}/${crypto.randomUUID()}.${extension}`;
}
