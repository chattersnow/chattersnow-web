/**
 * What an autosave is allowed to send the minutes (#1199).
 *
 * Takes a typed object rather than `FormData`, matching the #1082 core style:
 * there is no form here, there is a debounced client sending the keys that
 * changed.
 *
 * The guards are the point. `notes` lands in a jsonb column that
 * `save_meeting_minutes_draft()` merges with `||`, so anything that gets past
 * here is stored verbatim and read back as the notes for a section -- exactly
 * the hazard `agenda-form.ts` documents, where `ongoingItems="hi"` once wrote a
 * bare string into jsonb. A flat record of strings is the only shape the merge
 * and the renderer both understand.
 */
import type { ParseResult } from "@/lib/forms";

export type MinutesPatch = {
  /** Only the keys that changed. Merged into `notes`, never replacing it. */
  notes: Record<string, string>;
  /**
   * Absent means "leave the closing notes alone". Present -- including as an
   * empty string -- means the notetaker set them to this. The two are different
   * writes, which is what the RPC's `p_body_text_set` argument exists for.
   */
  body_text?: string | null;
};

export type MinutesPatchInput = {
  notes?: unknown;
  bodyText?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Every key `buildMinutesSnapshot()` mints: a bare item name (`opening`,
 * `parking_lot`) or one qualified after a colon (`section:finance_fundraising`,
 * `new_business:0`), where the section half is itself a template section key
 * and so already matches `isValidSectionKey`.
 *
 * Checking the shape rather than only the emptiness closes two things at once.
 * A key that matches nothing in the snapshot is notes written into a section
 * that does not exist -- a bug, silently stored forever, since the merge never
 * deletes. And it keeps `__proto__` and friends out of an object built from
 * request data, which is what CodeQL's remote-property-injection rule is about;
 * this parser deliberately validates the caller's object in place and hands it
 * on, rather than copying it key by key into a fresh one, so there is no
 * computed property write here at all.
 */
const NOTE_KEY_PATTERN = /^[a-z][a-z0-9_]*(:[a-z0-9_]+)?$/;

export function parseMinutesPatch(
  input: MinutesPatchInput,
): ParseResult<MinutesPatch> {
  const notesRefusal = {
    error: "Could not read the meeting notes. Please try again.",
    field: "notes",
  };

  let notes: Record<string, string> = {};

  if (input.notes !== undefined) {
    if (!isRecord(input.notes)) return notesRefusal;

    for (const [key, value] of Object.entries(input.notes)) {
      if (typeof value !== "string") return notesRefusal;
      if (!NOTE_KEY_PATTERN.test(key)) return notesRefusal;
    }
    notes = input.notes as Record<string, string>;
  }

  // `undefined` is absent, not "clear it": a Server Action argument that was
  // never set arrives that way, and losing the closing notes because a client
  // omitted a field would be silent. Clearing them is `null`, said on purpose.
  if (input.bodyText === undefined) return { data: { notes } };

  if (input.bodyText === null) return { data: { notes, body_text: null } };
  if (typeof input.bodyText !== "string") {
    return {
      error: "Could not read the closing notes. Please try again.",
      field: "bodyText",
    };
  }
  return { data: { notes, body_text: input.bodyText } };
}
