import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import {
  EMPTY_MINOR_CONTACTS,
  MinorAccompanimentFields,
} from "./minor-accompaniment-fields";
import {
  MINOR_CONTACT_LABELS,
  MINOR_FORM_ASKS_FOR,
  MINOR_THIRD_PARTY_NOTE,
} from "@/lib/minors";

// Real lengths, not "Paragraph one" (#685): what a tenant writes here is a
// safeguarding rule in two or three sentences, and the seeded Chatter Snow row
// is the shape to test against.
const WRITTEN = [
  "Anyone under 18 is welcome with a parent or legal guardian, and that adult needs to be at the event with them for the whole of it. We are not set up or staffed to supervise anyone, and our volunteers are not chaperones — if the responsible adult leaves, the minor leaves too.",
  "The accompanying adult registers too, so please include them in the number attending. We do not set a minimum age, though the resort and the rental shop apply their own, and an individual program may set its own rules on top of these.",
];

function renderBlock(paragraphs: string[]) {
  return render(
    <MinorAccompanimentFields
      idPrefix="registration"
      paragraphs={paragraphs}
      values={EMPTY_MINOR_CONTACTS}
      onChange={() => {}}
    />,
  );
}

describe("MinorAccompanimentFields (#685)", () => {
  test("renders the organization's own rule, in order, under a heading", () => {
    renderBlock(WRITTEN);

    expect(
      screen.getByRole("heading", {
        name: "If anyone in your party is under 18",
      }),
    ).toBeDefined();
    for (const paragraph of WRITTEN) {
      expect(screen.getByText(paragraph)).toBeDefined();
    }
  });

  // The state every tenant starts in, and the one that must never break. A
  // heading reading "If anyone in your party is under 18" with no rule under
  // it would be a safeguarding policy the platform invented.
  test("an unwritten slot renders no heading, and still says what the form asks", () => {
    renderBlock([]);

    expect(
      screen.queryByRole("heading", {
        name: "If anyone in your party is under 18",
      }),
    ).toBeNull();
    expect(screen.getByText(MINOR_FORM_ASKS_FOR)).toBeDefined();
  });

  test("a blank paragraph is not a paragraph", () => {
    renderBlock(["   ", ""]);
    expect(
      screen.queryByRole("heading", {
        name: "If anyone in your party is under 18",
      }),
    ).toBeNull();
  });

  test("asks for all four contacts, and requires each of them", () => {
    renderBlock(WRITTEN);

    for (const label of Object.values(MINOR_CONTACT_LABELS)) {
      const field = screen.getByLabelText(new RegExp(label, "i"));
      expect(field).toBeDefined();
      expect((field as HTMLInputElement).required).toBe(true);
    }
  });

  // The emergency contact never visits the site, so they are the one person
  // here who cannot be given notice at the point of collection. The registrant
  // is asked to give it instead, and that sentence is not optional.
  test("asks the registrant to tell the emergency contact", () => {
    renderBlock([]);
    expect(screen.getByText(MINOR_THIRD_PARTY_NOTE)).toBeDefined();
  });

  // #1318: submitting a public form accepts nothing. The one box on this form
  // that carries a real choice is the participant agreement's, and a second
  // box that cannot be declined would dilute it.
  test("takes no consent: no checkbox, and nothing to agree to", () => {
    const { container } = renderBlock(WRITTEN);
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(
      0,
    );
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });
});
