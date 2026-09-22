import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { GearAsIsNotice } from "./gear-as-is-notice";
import { GEAR_AS_IS_SUMMARY, gearAsIsText } from "@/lib/gear-as-is";
import { DEFAULT_LEXICON, lexiconFromRows } from "@/lib/lexicon";

describe("GearAsIsNotice (#1367)", () => {
  test("says every paragraph the snapshot stores", () => {
    const { container } = render(<GearAsIsNotice />);

    // Not a paraphrase of the record: the words on screen and the words
    // written to `gear_requests.as_is_text` come from the same constant.
    for (const paragraph of gearAsIsText(DEFAULT_LEXICON).split("\n\n")) {
      expect(screen.getByText(paragraph)).toBeDefined();
    }
    expect(container.querySelectorAll("p")).toHaveLength(
      GEAR_AS_IS_SUMMARY.length,
    );
  });

  // A notice may link a document only where that document is served: `/terms`
  // 404s on a tenant that has adopted none (#859). The claim itself is the
  // platform's own and is unconditional either way.
  test("links the terms only where the tenant serves them", () => {
    const { container } = render(<GearAsIsNotice />);
    expect(container.querySelectorAll("a")).toHaveLength(0);

    render(<GearAsIsNotice termsInForce />);
    const link = screen.getByRole("link", {
      name: "Terms of Use (opens in new tab)",
    });
    expect(link.getAttribute("href")).toBe("/terms");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  // The box lives on the form beside the button it gates, not here: this
  // component is the words above it.
  test("offers nothing to tick", () => {
    const { container } = render(<GearAsIsNotice termsInForce />);
    expect(container.querySelectorAll("input")).toHaveLength(0);
  });

  // #896: an organization that lends tools reads "tools", in the notice and
  // in the terms-of-use section built from the same constant.
  test("is written in this organization's own word for what it lends", () => {
    render(
      <GearAsIsNotice
        lexicon={lexiconFromRows([{ term: "item_plural", value: "Tools" }])}
      />,
    );

    expect(
      screen.getByText(/We give away tools exactly as they reach us/),
    ).toBeDefined();
  });
});
