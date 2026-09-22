/**
 * An Instagram handle as the columns that hold it define it.
 *
 * `people.instagram_handle`, `event_registrations.instagram_handle` and
 * `person_claims.stated_instagram_handle` all carry the same check constraint
 * (`^[A-Za-z0-9._]{1,30}$`), so a value this module accepts is one Postgres
 * will accept -- which matters because a handle that fails the constraint
 * would otherwise take a whole submission down with it rather than being
 * reported as the one field it is.
 *
 * The leading `@` is stripped rather than refused: people write it, and
 * `normalize_instagram_handle()` in the database strips one too.
 */

/** Matches the check constraint on every column that stores a handle. */
export const INSTAGRAM_HANDLE_PATTERN = /^[A-Za-z0-9._]{1,30}$/;

export const INSTAGRAM_HANDLE_ERROR =
  "An Instagram handle can only contain letters, numbers, periods and underscores.";

/**
 * Trim a raw form value to what the column stores, or an error when it is not
 * a handle. Blank becomes null: the field is optional everywhere it appears.
 */
export function parseInstagramHandle(
  raw: FormDataEntryValue | null,
): { error: string } | { instagramHandle: string | null } {
  const instagramHandle = String(raw ?? "")
    .trim()
    .replace(/^@/, "");
  if (instagramHandle && !INSTAGRAM_HANDLE_PATTERN.test(instagramHandle)) {
    return { error: INSTAGRAM_HANDLE_ERROR };
  }
  return { instagramHandle: instagramHandle || null };
}
