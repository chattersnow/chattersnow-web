import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import {
  FORM_ASKS_FOR,
  VolunteerScreeningNotice,
} from "./volunteer-screening-notice";

// Real lengths, not "Paragraph one": what a tenant writes here is a couple of
// sentences about references and a conversation, and a one-word sample hides
// nothing but also proves nothing (#690).
const WRITTEN = [
  "We'll read your application and email you about next steps — usually a conversation about what you'd like to do and when you're free.",
  "We don't run background checks on volunteers. For roles that pair you with a participant we'll ask for references and talk it through with you first. If that ever changes we'll say so here before it applies to anyone.",
];

describe("VolunteerScreeningNotice (#690)", () => {
  test("renders the organization's own words, in order, under a heading", () => {
    const { container } = render(
      <VolunteerScreeningNotice paragraphs={WRITTEN} />,
    );

    expect(
      screen.getByRole("heading", { name: "What happens after you apply" }),
    ).toBeDefined();
    for (const paragraph of WRITTEN) {
      expect(screen.getByText(paragraph)).toBeDefined();
    }

    const rendered = [...container.querySelectorAll("p")].map(
      (node) => node.textContent,
    );
    expect(rendered).toEqual([...WRITTEN, FORM_ASKS_FOR]);
  });

  // A tenant that has decided nothing describes nothing. The heading is the
  // part that has to go: "What happens after you apply" with only the sentence
  // below it would be a promise nobody made.
  test("an unwritten slot renders no heading, and still says what the form asks for", () => {
    render(<VolunteerScreeningNotice paragraphs={[]} />);

    expect(
      screen.queryByRole("heading", { name: "What happens after you apply" }),
    ).toBeNull();
    expect(screen.getByText(FORM_ASKS_FOR)).toBeDefined();
  });

  test("whitespace is not content", () => {
    render(<VolunteerScreeningNotice paragraphs={["   ", ""]} />);

    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText(FORM_ASKS_FOR)).toBeDefined();
  });

  // The sentence is the one claim the platform makes here, so it is pinned
  // rather than matched loosely: it promises the form does not ask for these,
  // and the parser test beside `parseVolunteerApplicationForm` is what keeps
  // the promise true.
  test("names what the form does not ask for", () => {
    render(<VolunteerScreeningNotice paragraphs={[]} />);

    const sentence = screen.getByText(FORM_ASKS_FOR).textContent ?? "";
    expect(sentence).toContain("date of birth");
    expect(sentence).toContain("home address");
    expect(sentence).toContain("Social Security or other government ID number");
  });

  // Notice, not consent (#1318): nothing here can be agreed to, and a box would
  // dilute the ones that carry a real choice (#599, #686).
  test("offers nothing to tick", () => {
    const { container } = render(
      <VolunteerScreeningNotice paragraphs={WRITTEN} />,
    );

    expect(container.querySelectorAll("input")).toHaveLength(0);
  });

  // The guard that matters most. The wording this block replaces ended by
  // saying volunteering meant agreeing to the code of conduct -- an acceptance
  // the form never obtains, pointing at a route that 404s until a tenant adopts
  // one (#859). Whatever a tenant types, this block links nothing.
  test("links nothing, whatever the tenant wrote", () => {
    const { container } = render(
      <VolunteerScreeningNotice
        paragraphs={[
          ...WRITTEN,
          "See our Code of Conduct and our Terms of Use.",
        ]}
      />,
    );

    expect(container.querySelectorAll("a")).toHaveLength(0);
  });
});
