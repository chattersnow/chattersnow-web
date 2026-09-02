// Pure logic for the sensitivity -> requirement matrix in issue #424
// ("Sensitivity -> requirement matrix (v1, enforced only where cheap)").
// Enforcement is UI-level flagging (dashboard alerts, badges), never a DB
// constraint -- an admin can record an asset before every field is fully
// compliant with its own sensitivity tier.

export const SENSITIVITY_LEVELS = [
  "low",
  "medium",
  "high",
  "critical",
] as const;
export type Sensitivity = (typeof SENSITIVITY_LEVELS)[number];

export const MFA_EXPECTATIONS = ["recommended", "required"] as const;
export type MfaExpectation = (typeof MFA_EXPECTATIONS)[number];

export const TWO_ADMIN_EXPECTATIONS = [
  "not_applicable",
  "recommended",
  "required",
] as const;
export type TwoAdminExpectation = (typeof TWO_ADMIN_EXPECTATIONS)[number];

const REVIEW_CADENCE_MONTHS: Record<Sensitivity, number> = {
  low: 12,
  medium: 12,
  high: 6,
  critical: 3,
};

const MFA_EXPECTATION_BY_SENSITIVITY: Record<Sensitivity, MfaExpectation> = {
  low: "recommended",
  medium: "required",
  high: "required",
  critical: "required",
};

const TWO_ADMIN_EXPECTATION_BY_SENSITIVITY: Record<
  Sensitivity,
  TwoAdminExpectation
> = {
  low: "not_applicable",
  medium: "recommended",
  high: "required",
  critical: "required",
};

export function reviewCadenceMonths(sensitivity: Sensitivity): number {
  return REVIEW_CADENCE_MONTHS[sensitivity];
}

export function mfaExpectationFor(sensitivity: Sensitivity): MfaExpectation {
  return MFA_EXPECTATION_BY_SENSITIVITY[sensitivity];
}

export function twoAdminExpectationFor(
  sensitivity: Sensitivity,
): TwoAdminExpectation {
  return TWO_ADMIN_EXPECTATION_BY_SENSITIVITY[sensitivity];
}

// Adds whole calendar months (not a fixed day count) so "reviewed on the
// last of the month" cadences don't drift, matching how the requirement
// matrix expresses cadence ("Annual", "6 months", "3 months").
export function computeNextReviewDate(
  sensitivity: Sensitivity,
  from: Date = new Date(),
): string {
  const months = reviewCadenceMonths(sensitivity);
  const next = new Date(
    Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth() + months,
      from.getUTCDate(),
    ),
  );
  return next.toISOString().slice(0, 10);
}

export function isReviewDue(
  nextReview: string | null,
  today: Date = new Date(),
): boolean {
  if (!nextReview) return false;
  return nextReview <= today.toISOString().slice(0, 10);
}
