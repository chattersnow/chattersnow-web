import type { Locator } from "@playwright/test";
import { expect } from "./test";

/**
 * Answers the registration form's minors question with "no" (#685).
 *
 * The question is required on both public registration forms, so every spec
 * that submits one has to answer it. "No" is the answer that leaves the rest
 * of the form exactly as it was before the question existed, which keeps these
 * specs about whatever they were about.
 *
 * Shared rather than copied because it is a Base UI select — a trigger and a
 * listbox option, not a `fill()` — and two spellings of that in two specs is
 * how one of them quietly stops selecting anything.
 */
export async function sayNoMinors(scope: Locator) {
  await scope.getByLabel(/Is anyone in your party under 18\?/).click();
  await scope
    .page()
    .getByRole("option", { name: /everyone is 18 or over/i })
    .click();
}

/**
 * Registration is three steps at every width (#1413): "About you", "This
 * event", then "Review and agree" with the notices, the agreement and the
 * button. These move through them, so a spec says where it is going rather
 * than how many times to press Next.
 */
export async function continueToThisEvent(scope: Locator) {
  await scope.getByRole("button", { name: "Next", exact: true }).click();
  await expect(scope.getByRole("group", { name: /This event/ })).toBeVisible();
}

/** From either earlier step to "Review and agree". */
export async function continueToReview(scope: Locator) {
  const next = scope.getByRole("button", { name: "Next", exact: true });
  const review = scope.getByRole("group", { name: /Review and agree/ });
  for (let press = 0; press < 2 && (await next.isVisible()); press++) {
    await next.click();
  }
  await expect(review).toBeVisible();
}

/** Moves on to the review step if it is not there already, then submits. */
export async function completeRegistration(scope: Locator) {
  await continueToReview(scope);
  await scope.getByRole("button", { name: "Complete registration" }).click();
}
