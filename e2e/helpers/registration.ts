import type { Locator } from "@playwright/test";

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
 * On a phone the registration form is two steps (#1403) and "Next" leads to
 * the one with the notices, the agreement and the button; on a wider screen
 * both are on one page and there is no "Next" to press. Shared so every spec
 * that registers works in both projects without asking which it is in.
 */
export async function continueToBeforeYouGo(scope: Locator) {
  const next = scope.getByRole("button", { name: "Next", exact: true });
  if (await next.isVisible()) await next.click();
}

/** Moves past the first step if there is one, then submits. */
export async function completeRegistration(scope: Locator) {
  await continueToBeforeYouGo(scope);
  await scope.getByRole("button", { name: "Complete registration" }).click();
}
