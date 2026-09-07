import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";

const demoSignInActionMock = mock(async () => ({ error: "" }));
mock.module("./demo-actions", () => ({
  demoSignInAction: demoSignInActionMock,
}));

const { DemoButton } = await import("./demo-button");

describe("DemoButton", () => {
  test("offers the demo and says what it is", () => {
    render(<DemoButton />);
    expect(
      screen.getByRole("button", { name: "Explore the demo" }),
    ).toBeTruthy();
    // The thing that keeps invented records from being read as real ones.
    expect(screen.getByText(/invented data/i)).toBeTruthy();
  });

  // The credentials are server-only (no NEXT_PUBLIC_), so nothing about them
  // may reach the rendered tree -- the button knows the demo exists and no
  // more.
  test("renders no credentials", () => {
    const { container } = render(<DemoButton />);
    expect(container.innerHTML).not.toMatch(/password/i);
    expect(container.innerHTML).not.toMatch(/@/);
  });
});
