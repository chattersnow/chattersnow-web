/**
 * Event media upload links (#1620): a link a coordinator hands a photographer
 * or videographer with no portal account, opening one page that uploads to one
 * event. The rules both sides share -- defaults, limits, the URL, the messages
 * -- live here; the link itself is checked in the database.
 */

/** A link's default expiry: this many days after the event ends. */
export const UPLOAD_LINK_DAYS_AFTER_EVENT = 7;

/** The per-link byte cap, in GB: the default and the range the database holds. */
export const UPLOAD_LINK_DEFAULT_CAP_GB = 50;
export const UPLOAD_LINK_MIN_CAP_GB = 1;
export const UPLOAD_LINK_MAX_CAP_GB = 1024;

export const GIB = 1024 * 1024 * 1024;

export const UPLOAD_LINK_LABEL_MAX = 120;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Seven days after the event's end (its start when it has none). An event
 * already that far past gets seven days from now, so the default is never a
 * link that is dead on arrival.
 */
export function defaultUploadLinkExpiry(
  event: { starts_at: string; ends_at: string | null },
  now: Date = new Date(),
): Date {
  const end = Date.parse(event.ends_at ?? event.starts_at);
  const base = Number.isFinite(end)
    ? Math.max(end, now.getTime())
    : now.getTime();
  return new Date(base + UPLOAD_LINK_DAYS_AFTER_EVENT * DAY_MS);
}

/**
 * The page a link opens. Under `/portal` because that resolves on every host
 * shape a tenant has -- a portal-only host like the platform tenant's included,
 * where the proxy shows it as `/media-upload/<token>`.
 */
export function uploadLinkPath(token: string): string {
  return `/portal/media-upload/${token}`;
}

export type UploadLinkStatus = "active" | "expired" | "revoked";

export function uploadLinkStatus(
  link: { expires_at: string; revoked_at: string | null },
  now: Date = new Date(),
): UploadLinkStatus {
  if (link.revoked_at) return "revoked";
  return Date.parse(link.expires_at) <= now.getTime() ? "expired" : "active";
}

/** What the link page says for any dead link, whichever kind it is. */
export const UPLOAD_LINK_INVALID =
  "This upload link isn't valid. It may have expired or been turned off — ask whoever sent it for a new one.";

/** The public RPCs' refusals, as the uploader reads them. */
export const UPLOAD_LINK_ERRORS: Record<string, string> = {
  LINK_INVALID: UPLOAD_LINK_INVALID,
  RATE_LIMITED: "Too many attempts — please wait a few minutes and try again.",
  OVER_CAP:
    "This link has reached its storage limit. Ask whoever sent it to raise it or send a new link.",
  RIGHTS_REQUIRED: "Confirm the rights statement above before uploading.",
  INVALID_BATCH: "Upload at most 100 files at a time.",
  MEDIA_NOT_FOUND: "The upload didn't arrive. Try again.",
  PERMISSION_DENIED: "That file can't be saved through this link.",
};

/** The message for an RPC error, matched on the code the database raised. */
export function uploadLinkError(message: string, fallback: string): string {
  const code = Object.keys(UPLOAD_LINK_ERRORS).find((key) =>
    message.includes(key),
  );
  return code ? UPLOAD_LINK_ERRORS[code] : fallback;
}
