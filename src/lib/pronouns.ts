/**
 * Pronouns are stored as free text (see
 * supabase/migrations/20260905060000_add_pronouns_to_people.sql): any fixed
 * list excludes somebody, so the forms suggest the common sets and accept
 * anything typed.
 *
 * Everything here is display/validation only. Nothing in the app may branch on
 * a person's pronouns.
 */

/** Matches the `char_length(pronouns) <= 40` check on all three columns. */
export const PRONOUNS_MAX_LENGTH = 40;

/**
 * Datalist suggestions, not an allowlist — the input stays free text. Ordered
 * most-common first because a datalist renders in the order given.
 */
export const PRONOUN_SUGGESTIONS = [
  "she/her",
  "he/him",
  "they/them",
  "she/they",
  "he/they",
  "ze/zir",
  "any pronouns",
  "prefer not to say",
] as const;

export const PRONOUNS_TOO_LONG_ERROR = `Pronouns must be ${PRONOUNS_MAX_LENGTH} characters or fewer.`;

/**
 * Trim a raw form value to what the column stores, or an error when it is over
 * length. Blank becomes null: the field is always optional.
 */
export function parsePronouns(
  raw: FormDataEntryValue | null,
): { error: string } | { pronouns: string | null } {
  const pronouns = String(raw ?? "").trim();
  if (pronouns.length > PRONOUNS_MAX_LENGTH) {
    return { error: PRONOUNS_TOO_LONG_ERROR };
  }
  return { pronouns: pronouns || null };
}
