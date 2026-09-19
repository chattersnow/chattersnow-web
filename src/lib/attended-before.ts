/**
 * "Have you been to one of our events before?" — asked at registration (#1259).
 *
 * A **self-reported** answer, and deliberately a different fact from the
 * first-time/recurring figures the portal already derives from check-ins
 * (`computeFirstTimeParticipants()` in
 * `src/app/portal/(app)/programs/reports/impact-rollup.ts`, the segment counts
 * in `people-segments.ts`, `get_event_impact_derived_data`). Those stay as they
 * are and remain the only source for anything that reaches an annual report;
 * this one is what somebody says about themselves on the way in. The two are
 * shown side by side and never merged — see
 * `supabase/migrations/20260919030000_registration_attended_before.sql`.
 *
 * Three states, not two. Unanswered is null, and nothing anywhere may read it
 * as "no": most of a registrant list will have skipped the question, and a
 * count that folded them into the first-timers would be wrong by that whole
 * population.
 *
 * Everything here is deliberately free of any reference to the directory. The
 * question is asked identically of every anonymous registrant, whatever the
 * organization holds for that address: a question that appeared only for
 * unmatched addresses would answer "do you have a record of me?" for anybody
 * who can fill in a form, which is the enumeration §5.23's claim flow refuses.
 */

/** The question, worded once so the two registration forms cannot drift. */
export const ATTENDED_BEFORE_QUESTION =
  "Have you been to one of our events before?";

/**
 * Why we ask, in the registrant's terms rather than ours. It says what the
 * answer is *for* and that it is optional; it never suggests the answer
 * changes anything about the registration, because it does not.
 */
export const ATTENDED_BEFORE_DESCRIPTION =
  "Optional. It helps us look after people who are new, and helps us find you if you ever ask us for your records.";

/**
 * The placeholder, which is also how the question goes unanswered: leaving the
 * select alone is the third state. It is worded as a choice rather than as an
 * instruction ("Select one") so that skipping reads as allowed.
 */
export const ATTENDED_BEFORE_PLACEHOLDER = "Rather not say";

export const ATTENDED_BEFORE_OPTIONS = [
  { value: "yes", label: "Yes, I've been to one before" },
  { value: "no", label: "No, this would be my first" },
] as const;

/** The select's value for a stored answer: `""` when it is unanswered. */
export function attendedBeforeValue(answer: boolean | null): string {
  if (answer === null) return "";
  return answer ? "yes" : "no";
}

/**
 * A raw form value as the column stores it. Anything that is not exactly
 * "yes" or "no" — blank, absent, or something hand-crafted — is unanswered,
 * which is the only safe reading of an answer we did not get.
 */
export function parseAttendedBefore(
  raw: FormDataEntryValue | null,
): boolean | null {
  const value = String(raw ?? "").trim();
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

/**
 * How the portal names the answer in a table cell or on a person record. Null
 * returns null rather than a dash so the caller decides what an unanswered
 * question looks like in its own surface.
 */
export function attendedBeforeLabel(answer: boolean | null): string | null {
  if (answer === null) return null;
  return answer ? "Been before" : "First time";
}

/**
 * How many of these registrants said this would be their first — `false`, not
 * "not true". A null is somebody who did not answer, and counting them as
 * first-timers would inflate the figure by everybody who skipped it.
 */
export function countSelfReportedFirstTimers(
  rows: readonly { attended_before: boolean | null }[],
): number {
  return rows.filter((row) => row.attended_before === false).length;
}

/** Whether anybody answered at all, which is what makes the count worth showing. */
export function hasAnyAttendedBeforeAnswer(
  rows: readonly { attended_before: boolean | null }[],
): boolean {
  return rows.some((row) => row.attended_before !== null);
}
