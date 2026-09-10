import type { ParseResult } from "@/lib/forms";
import { TIMEZONE_OPTIONS } from "@/lib/time";

export type ArtworkCallFormData = {
  title: string;
  /** Null when the call stands on its own (#879). */
  eventId: string | null;
  /** Null inherits the attached event's zone, or falls back to UTC. */
  timezone: string | null;
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
  intro: string | null;
  rightsNote: string | null;
  maxImages: number;
};

/**
 * A cap rather than a hard requirement, and a tight one (#876). The rights note
 * is a line in a scanned brief, not a second introduction -- anything longer
 * belongs in `intro`, where it will be read as prose.
 */
const RIGHTS_NOTE_MAX = 500;

const TITLE_MAX = 200;

/**
 * Pure, so the rules can be tested without a Supabase client -- the same split
 * parseReimbursementForm and parseContactForm use.
 *
 * The window is optional at both ends. A call with neither date is governed by
 * `is_open` alone, which is what a curator wants when the deadline is "when we
 * have enough". Since #879 the *event* is optional too, and the title is the
 * one thing that is not: it is the public page's heading, so a call without one
 * has nothing to render.
 */
export function parseArtworkCallForm(
  formData: FormData,
): ParseResult<ArtworkCallFormData> {
  const title = String(formData.get("title") ?? "").trim();
  const eventId = String(formData.get("eventId") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  const isOpen = formData.get("isOpen") === "on";
  const opensAt = String(formData.get("opensAt") ?? "").trim();
  const closesAt = String(formData.get("closesAt") ?? "").trim();
  const intro = String(formData.get("intro") ?? "").trim();
  const rightsNote = String(formData.get("rightsNote") ?? "").trim();
  const maxImagesRaw = String(formData.get("maxImages") ?? "3").trim();

  if (!title) return { error: "Give the call a title." };
  if (title.length > TITLE_MAX) {
    return { error: `Please keep the title under ${TITLE_MAX} characters.` };
  }
  // Checked against the same list the events form offers rather than accepted
  // as free text: a typo here means a deadline rendered in the wrong zone, and
  // formatDateTimeInZone would swallow it by silently falling back.
  if (timezone && !TIMEZONE_OPTIONS.some((o) => o.value === timezone)) {
    return { error: "That is not a timezone we recognise." };
  }

  const maxImages = Number.parseInt(maxImagesRaw, 10);
  if (!Number.isInteger(maxImages) || maxImages < 1 || maxImages > 5) {
    return { error: "Images per submission must be between 1 and 5." };
  }
  if (intro.length > 4000) {
    return { error: "Please keep the introduction under 4000 characters." };
  }
  if (rightsNote.length > RIGHTS_NOTE_MAX) {
    return {
      error: `Please keep the rights and credit note under ${RIGHTS_NOTE_MAX} characters.`,
    };
  }
  if (opensAt && closesAt && new Date(closesAt) < new Date(opensAt)) {
    return { error: "The closing date cannot be before the opening date." };
  }

  return {
    data: {
      title,
      eventId: eventId || null,
      timezone: timezone || null,
      isOpen,
      opensAt: opensAt ? new Date(opensAt).toISOString() : null,
      closesAt: closesAt ? new Date(closesAt).toISOString() : null,
      intro: intro || null,
      rightsNote: rightsNote || null,
      maxImages,
    },
  };
}
