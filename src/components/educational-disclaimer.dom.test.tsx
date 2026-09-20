import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { EducationalDisclaimer } from "./educational-disclaimer";

describe("EducationalDisclaimer (#1331)", () => {
  test("renders the tenant's own words", () => {
    render(<EducationalDisclaimer text="Check with your accountant." />);
    expect(screen.getByText("Check with your accountant.")).toBeDefined();
    expect(screen.getByText("Educational content only")).toBeDefined();
  });

  // A tenant whose Learn section is a security page and an FAQ has nothing to
  // disclaim, and an alert with a heading and no body reads as a page that
  // failed to load rather than as a notice that was cleared on purpose.
  test("a cleared slot renders nothing, heading included", () => {
    const { container } = render(<EducationalDisclaimer text="   " />);
    expect(container.innerHTML).toBe("");
  });
});
