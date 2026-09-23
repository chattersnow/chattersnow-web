import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { AdultsOnlyBadge } from "./adults-only-badge";

describe("AdultsOnlyBadge (#1417)", () => {
  test("renders 18+ on an adults-only event", () => {
    render(<AdultsOnlyBadge adultsOnly />);
    expect(screen.getByText("18+")).toBeVisible();
    expect(
      screen.getByText("Adults only: everyone must be 18 or over"),
    ).toBeInTheDocument();
  });

  test.each([false, null, undefined])("renders nothing for %p", (value) => {
    const { container } = render(<AdultsOnlyBadge adultsOnly={value} />);
    expect(container).toBeEmptyDOMElement();
  });
});
