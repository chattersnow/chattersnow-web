import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { PhotoConsentNotice } from "./photo-consent-notice";
import { PHOTO_CONSENT_HEADING } from "@/lib/photo-consent";

// Real lengths, not "Paragraph one": what a tenant writes here is two or three
// sentences naming where its photos actually go and saying that registering
// carries the agreement, and the length is what pushes the waiver's box far
// enough down the form to matter.
const WRITTEN = [
  "We take photos and video at our events, and we use them in our own newsletters, on this site, and on our social media accounts. We sometimes share them with the partners and sponsors who make an event possible, and we include them in reports to the funders who pay for our programs.",
  "Registering for one of our events means you are happy for us to do that. We never sell photos, and we do not tag anyone by name without asking first. If a photo of you is already up and you would rather it were not, tell any organizer or email us and we will take it down.",
];

function renderNotice(paragraphs: string[]) {
  return render(<PhotoConsentNotice paragraphs={paragraphs} />);
}

describe("PhotoConsentNotice (#599, #1376)", () => {
  test("renders the organization's own paragraphs, in order, under a heading", () => {
    renderNotice(WRITTEN);

    expect(
      screen.getByRole("heading", { name: PHOTO_CONSENT_HEADING }),
    ).toBeDefined();
    for (const paragraph of WRITTEN) {
      expect(screen.getByText(paragraph)).toBeDefined();
    }
  });

  // The state almost every tenant is in, and the one that must never break.
  // Nothing at all: not even a bare heading.
  // Without paragraphs nothing is implied by registering, so the form is
  // byte-identical to the one that shipped before #599.
  test("the first paragraph always shows; the rest fold under a toggle (#1403)", () => {
    const { container } = renderNotice(WRITTEN);

    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    // The opening of what registering agrees to is never behind the click.
    expect(details?.contains(screen.getByText(WRITTEN[0]))).toBe(false);
    expect(details?.contains(screen.getByText(WRITTEN[1]))).toBe(true);
    expect(container.querySelector("summary")?.textContent).toContain(
      "More about photos",
    );
  });

  test("one paragraph has nothing to fold", () => {
    const { container } = renderNotice([WRITTEN[0]]);

    expect(screen.getByText(WRITTEN[0])).toBeDefined();
    expect(container.querySelector("details")).toBeNull();
  });

  test("an unwritten slot renders nothing whatsoever", () => {
    const { container } = renderNotice([]);

    expect(container.querySelector("*")).toBeNull();
    expect(
      screen.queryByRole("heading", { name: PHOTO_CONSENT_HEADING }),
    ).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  test("a blank paragraph is not a paragraph", () => {
    const { container } = renderNotice(["   ", ""]);
    expect(container.querySelector("*")).toBeNull();
  });

  // The whole of #1376 in one assertion. There is no box -- not a consent box
  // and not a decline box either, which was offered and refused -- so nothing
  // on this block can be ticked, and nothing it renders can be submitted.
  test("there is no control of any kind", () => {
    const { container } = renderNotice(WRITTEN);

    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  // There is no `/photo-consent` route, deliberately: a policy in the footer's
  // Legal bar is published at the one place nobody reads it.
  test("links nowhere", () => {
    const { container } = renderNotice(WRITTEN);
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });
});
