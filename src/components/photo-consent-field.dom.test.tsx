import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { PhotoConsentField } from "./photo-consent-field";
import {
  PHOTO_CONSENT_FORM_NOTE,
  PHOTO_CONSENT_HEADING,
  photoConsentLabel,
} from "@/lib/photo-consent";

// Real lengths, not "Paragraph one": what a tenant writes here is two or three
// sentences naming where its photos actually go, and the length is what pushes
// the box far enough down the form to matter.
const WRITTEN = [
  "We take photos and video at our events, and we use them in our own newsletters, on this site, and on our social media accounts. We sometimes share them with the partners and sponsors who make an event possible, and we include them in reports to the funders who pay for our programs.",
  "We never sell photos, and we do not tag anyone by name without asking first. If a photo of you is already up and you would rather it were not, tell any organizer or email us and we will take it down.",
];

function renderField(
  paragraphs: string[],
  options: { partyIncludesMinor?: boolean; checked?: boolean } = {},
) {
  return render(
    <PhotoConsentField
      idPrefix="registration"
      paragraphs={paragraphs}
      partyIncludesMinor={options.partyIncludesMinor}
      checked={options.checked ?? false}
      onChange={() => {}}
    />,
  );
}

describe("PhotoConsentField (#599)", () => {
  test("renders the organization's own scope, in order, under a heading", () => {
    renderField(WRITTEN);

    expect(
      screen.getByRole("heading", { name: PHOTO_CONSENT_HEADING }),
    ).toBeDefined();
    for (const paragraph of WRITTEN) {
      expect(screen.getByText(paragraph)).toBeDefined();
    }
  });

  // The state almost every tenant is in, and the one that must never break.
  // Nothing at all: not an empty box, not a bare heading, not even the
  // platform's own note. Without a scope there is no question, so the form is
  // byte-identical to the one that shipped before this ticket.
  test("an unwritten slot renders nothing whatsoever", () => {
    const { container } = renderField([]);

    expect(container.querySelector("*")).toBeNull();
    expect(
      screen.queryByRole("heading", { name: PHOTO_CONSENT_HEADING }),
    ).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText(PHOTO_CONSENT_FORM_NOTE)).toBeNull();
  });

  test("a blank paragraph is not a paragraph", () => {
    const { container } = renderField(["   ", ""]);
    expect(container.querySelector("*")).toBeNull();
  });

  // The two halves of "a real choice": it starts unticked, because a pre-ticked
  // box is not a consent, and it is not `required`, because a box that cannot
  // be declined dilutes the waiver's, which can only be accepted.
  test("the box starts unticked and does not gate the form", () => {
    const { container } = renderField(WRITTEN);

    const box = container.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement | null;
    expect(box).not.toBeNull();
    expect(box!.checked).toBe(false);
    expect(box!.required).toBe(false);
  });

  test("a stored yes renders ticked", () => {
    const { container } = renderField(WRITTEN, { checked: true });
    const box = container.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    expect(box.checked).toBe(true);
  });

  test("the label is the accessible name of the box", () => {
    renderField(WRITTEN);
    expect(
      screen.getByRole("checkbox", { name: photoConsentLabel(false) }),
    ).toBeDefined();
  });

  // #685 gave the form the signal; this ticket branches the label and not the
  // record. One column, one answer.
  test("a party with a minor is asked in the guardian's capacity", () => {
    renderField(WRITTEN, { partyIncludesMinor: true });

    expect(screen.getByText(/parent or guardian/i)).toBeDefined();
    // Still one box. Two consent columns on one registration would be two
    // things to keep in step and two things to reconcile at the camera.
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  });

  // There is no `/photo-consent` route, deliberately: a policy in the footer's
  // Legal bar is published at the one place nobody reads it.
  test("links nowhere", () => {
    const { container } = renderField(WRITTEN);
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });

  test("says what happens to the answer, on every tenant that asks", () => {
    renderField(WRITTEN);
    expect(screen.getByText(PHOTO_CONSENT_FORM_NOTE)).toBeDefined();
  });
});
