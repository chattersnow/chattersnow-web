import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { PrivacyNotice, PRIVACY_NOTICE_SURFACES } from "./privacy-notice";
import { lexiconFromRows } from "@/lib/lexicon";

// The component's own list, so a surface added without a test cannot happen.
const SURFACES = PRIVACY_NOTICE_SURFACES;

describe("PrivacyNotice (#684)", () => {
  // The whole point of the component: a link to the one legal document that is
  // served for every tenant, whatever else it has adopted (#859).
  test.each(SURFACES)("%s links to the privacy policy", (surface) => {
    render(<PrivacyNotice surface={surface} />);

    const link = screen.getByRole("link", {
      name: "Privacy Policy (opens in new tab)",
    });
    expect(link.getAttribute("href")).toBe("/privacy");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.textContent).toBe("Privacy Policy");
  });

  test.each(SURFACES)("%s says what the form's fields are for", (surface) => {
    render(<PrivacyNotice surface={surface} />);
    expect(screen.getByText(/We use what you enter here/)).toBeDefined();
  });

  // Notice, not consent: a privacy policy binds the organization whether or
  // not a box was ticked, and a box here would dilute the ones that carry a
  // real choice (#599, #686).
  test.each(SURFACES)("%s offers nothing to tick", (surface) => {
    const { container } = render(<PrivacyNotice surface={surface} />);
    expect(container.querySelectorAll("input")).toHaveLength(0);
  });

  test("each form gets its own sentence", () => {
    const sentences = SURFACES.map((surface) => {
      const { container } = render(<PrivacyNotice surface={surface} />);
      return container.textContent;
    });
    expect(new Set(sentences).size).toBe(SURFACES.length);
  });

  // No "Chatter Snow", and no "gear": the copy is first person so it is
  // already whoever serves it, and the one noun that names a thing comes from
  // the tenant's lexicon (#896).
  test("the gear request names what this organization lends", () => {
    render(
      <PrivacyNotice
        surface="gearRequest"
        lexicon={lexiconFromRows([{ term: "item_plural", value: "Tools" }])}
      />,
    );
    expect(
      screen.getByText(/match you with the tools you asked for/),
    ).toBeDefined();
  });

  test("a tenant that has named nothing gets the platform's word", () => {
    render(<PrivacyNotice surface="gearRequest" />);
    expect(
      screen.getByText(/match you with the items you asked for/),
    ).toBeDefined();
  });
});
