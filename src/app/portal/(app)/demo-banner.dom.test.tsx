import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { DemoBanner } from "./demo-banner";

describe("DemoBanner", () => {
  // A visitor arrives holding admin over donations, expenses and people, and
  // this banner is the only thing on the page that says none of it is real.
  test("says the data is invented and is rebuilt nightly", () => {
    render(<DemoBanner />);
    const banner = screen.getByRole("status");
    expect(banner.textContent).toMatch(/invented/i);
    expect(banner.textContent).toMatch(/each night/i);
  });
});
