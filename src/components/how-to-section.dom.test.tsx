import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { HowToSection } from "./how-to-section";

describe("HowToSection", () => {
  test("renders a heading and its content", () => {
    render(
      <HowToSection heading="Common mistakes">
        <p>Forgetting to set visibility.</p>
      </HowToSection>,
    );

    expect(
      screen.getByRole("heading", { name: "Common mistakes" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Forgetting to set visibility."),
    ).toBeInTheDocument();
  });
});
