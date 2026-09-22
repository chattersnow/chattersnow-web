import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { EventWaiver } from "./event-waiver";
import type { LegalDocumentContent } from "@/lib/site-content";

const DOC: LegalDocumentContent = {
  title: "Participant Waiver",
  last_updated: "September 22, 2026",
  summary: ["Please read this before you register."],
  sections: [
    {
      id: "risks",
      title: "Risks of taking part",
      paragraphs: [
        "Skiing and snowboarding are **dangerous**.",
        "- Falls\n- Collisions",
      ],
    },
    {
      id: "questions",
      title: "Questions",
      paragraphs: ["Ask us at [our contact page](/contact)."],
    },
  ],
};

describe("EventWaiver", () => {
  // The point of the record this form writes is that the person was shown the
  // words. A link alone would make "which version did they accept" answerable
  // and "did they see it" not, so the whole document is in the DOM (#686).
  test("renders every section in full, not a link to them", () => {
    render(<EventWaiver doc={DOC} version={2} headingId="waiver-title" />);

    expect(screen.getByText("Risks of taking part")).toBeVisible();
    expect(screen.getByText("Questions")).toBeVisible();
    expect(
      screen.getByText("Please read this before you register."),
    ).toBeVisible();
    expect(screen.getByText("Falls")).toBeVisible();
    expect(screen.getByText("Collisions")).toBeVisible();
    expect(screen.getByText("dangerous")).toBeVisible();
  });

  test("names the version and links that exact one", () => {
    render(<EventWaiver doc={DOC} version={2} headingId="waiver-title" />);

    expect(screen.getByText(/Version 2/)).toBeVisible();
    // Not `/waiver`: a permalink to the version on screen is what the
    // registration's stored pointer resolves to.
    expect(
      screen.getByRole("link", { name: /open this version/i }),
    ).toHaveAttribute("href", "/waiver?version=2");
  });

  // A scrollable region that cannot be focused cannot be scrolled from the
  // keyboard, which is what axe's `scrollable-region-focusable` is about, and
  // a focusable div with no role or name announces as nothing.
  test("the scrolling frame is reachable and named", () => {
    render(<EventWaiver doc={DOC} version={2} headingId="waiver-title" />);

    const frame = screen.getByRole("group", { name: "Participant Waiver" });
    expect(frame).toHaveAttribute("tabindex", "0");
  });

  // The ids belong to /waiver's section rail. A second copy of them inside a
  // form would be a real duplicate-id bug rather than a cosmetic one.
  test("carries none of the document page's section anchors", () => {
    const { container } = render(
      <EventWaiver doc={DOC} version={2} headingId="waiver-title" />,
    );

    expect(container.querySelector("#risks")).toBeNull();
    expect(container.querySelector("#questions")).toBeNull();
  });

  // The waiver's own heading is an h3, matching event-sponsors.tsx and
  // rider-profile-form-fields.tsx in the same position, so the outline reads
  // the same under the page's h1 and under the sheet's h2. Its sections sit a
  // level below that.
  test("keeps the heading outline honest inside a form", () => {
    const { container } = render(
      <EventWaiver doc={DOC} version={2} headingId="waiver-title" />,
    );

    expect(container.querySelector("h3")?.textContent).toBe(
      "Participant Waiver",
    );
    expect(
      [...container.querySelectorAll("h4")].map((node) => node.textContent),
    ).toEqual(["Risks of taking part", "Questions"]);
    expect(container.querySelector("h1, h2")).toBeNull();
  });
});
