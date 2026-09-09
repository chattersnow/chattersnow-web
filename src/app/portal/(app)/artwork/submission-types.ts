/**
 * URL parameter the notification email (#870) links one submission with.
 *
 * Here rather than beside the sheet that consumes it because the page reading
 * it is a Server Component: a non-component export from a "use client" module
 * reaches the server as a client-reference proxy, not as the string, so
 * `searchParams[SUBMISSION_PARAM]` would silently resolve to undefined.
 */
export const SUBMISSION_PARAM = "submission";

/** Mirrors the check constraint on artwork_submissions.status. */
export const ARTWORK_SUBMISSION_STATUSES = [
  "pending",
  "approved",
  "rejected",
] as const;
export type ArtworkSubmissionStatus =
  (typeof ARTWORK_SUBMISSION_STATUSES)[number];

export type ArtworkSubmissionImage = {
  id: string;
  storage_path: string;
  thumb_path: string;
  content_type: string;
  byte_size: number | null;
  position: number;
};

export type ArtworkSubmission = {
  id: string;
  submitter_name: string;
  submitter_email: string;
  title: string | null;
  medium: string | null;
  artist_statement: string | null;
  status: ArtworkSubmissionStatus;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  event: { id: string; name: string } | null;
  images: ArtworkSubmissionImage[];
};

/**
 * A submission's images with a signed URL against each, minted by the page.
 *
 * The bucket is private, so nothing renders without one. They are kept apart
 * from the row because they expire: a URL cached into a row type would
 * eventually be handed to a component with no way to tell it had gone stale.
 */
export type SignedArtworkImage = ArtworkSubmissionImage & {
  thumbUrl: string | null;
  originalUrl: string | null;
};

export type ArtworkCall = {
  id: string;
  event_id: string;
  submission_code: string;
  is_open: boolean;
  opens_at: string | null;
  closes_at: string | null;
  intro: string | null;
  max_images: number;
  event: { id: string; name: string; starts_at: string } | null;
  submission_count: number;
};

/** The public page a call's code addresses. */
export function artworkCallPath(code: string): string {
  return `/artwork/${code}`;
}
