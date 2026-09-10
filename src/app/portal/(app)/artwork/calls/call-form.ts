import type { ParseResult } from "@/lib/forms";

export type ArtworkCallFormData = {
  eventId: string;
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

/**
 * Pure, so the rules can be tested without a Supabase client -- the same split
 * parseReimbursementForm and parseContactForm use.
 *
 * The window is optional at both ends. A call with neither date is governed by
 * `is_open` alone, which is what a curator wants when the deadline is "when we
 * have enough".
 */
export function parseArtworkCallForm(
  formData: FormData,
): ParseResult<ArtworkCallFormData> {
  const eventId = String(formData.get("eventId") ?? "").trim();
  const isOpen = formData.get("isOpen") === "on";
  const opensAt = String(formData.get("opensAt") ?? "").trim();
  const closesAt = String(formData.get("closesAt") ?? "").trim();
  const intro = String(formData.get("intro") ?? "").trim();
  const rightsNote = String(formData.get("rightsNote") ?? "").trim();
  const maxImagesRaw = String(formData.get("maxImages") ?? "3").trim();

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
      eventId,
      isOpen,
      opensAt: opensAt ? new Date(opensAt).toISOString() : null,
      closesAt: closesAt ? new Date(closesAt).toISOString() : null,
      intro: intro || null,
      rightsNote: rightsNote || null,
      maxImages,
    },
  };
}
