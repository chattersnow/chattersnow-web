import type { ParseResult } from "@/lib/forms";

export type PersonScreeningFormData = {
  tier_id: string;
  cleared_on: string;
  expires_on: string | null;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * What the portal is allowed to record about a screening (#1360).
 *
 * This function is an ALLOWLIST, and that is the point of it. It reads three
 * fields and only three. A hand-posted `notes`, `reason`, `provider` or
 * `result` is not rejected with a message telling the sender what to try
 * instead -- it is never read, and there is no column for it to reach. The
 * promise that check results never enter the portal is kept here and in the
 * schema, not by asking reviewers to be careful.
 *
 * `today` is passed in rather than computed, so the future-date rule answers
 * for the tenant's own day (the rule `volunteer_hour_submissions` follows) and
 * so this module stays pure and unit-testable.
 */
export function parsePersonScreeningForm(
  formData: FormData,
  today: string,
): ParseResult<PersonScreeningFormData> {
  const tierId = String(formData.get("tierId") ?? "").trim();
  const clearedOn = String(formData.get("clearedOn") ?? "").trim();
  const expiresOn = String(formData.get("expiresOn") ?? "").trim();

  if (!tierId) {
    return { error: "A screening level is required.", field: "tierId" };
  }
  if (!ISO_DAY.test(clearedOn)) {
    return { error: "A decision date is required.", field: "clearedOn" };
  }
  if (clearedOn > today) {
    return {
      error: "The decision date cannot be in the future.",
      field: "clearedOn",
    };
  }
  if (expiresOn !== "") {
    if (!ISO_DAY.test(expiresOn)) {
      return { error: "That is not a valid date.", field: "expiresOn" };
    }
    if (expiresOn < clearedOn) {
      return {
        error: "The clearance cannot run out before it was given.",
        field: "expiresOn",
      };
    }
  }

  return {
    data: {
      tier_id: tierId,
      cleared_on: clearedOn,
      expires_on: expiresOn || null,
    },
  };
}
