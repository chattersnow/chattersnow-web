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

export function parseMinutesPatch(
  input: MinutesPatchInput,
): ParseResult<MinutesPatch> {
  const notes: Record<string, string> = {};

  if (input.notes !== undefined) {
    if (!isRecord(input.notes)) {
      return {
        error: "Could not read the meeting notes. Please try again.",
        field: "notes",
      };
    }
    for (const [key, value] of Object.entries(input.notes)) {
      if (typeof value !== "string") {
        return {
          error: "Could not read the meeting notes. Please try again.",
          field: "notes",
        };
      }
      if (key.trim() === "") {
        return {
          error: "Could not read the meeting notes. Please try again.",
          field: "notes",
        };
      }
      notes[key] = value;
    }
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
