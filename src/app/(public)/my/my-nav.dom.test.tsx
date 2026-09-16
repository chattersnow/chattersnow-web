import { describe, expect, mock, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";

// SignOutButton reaches for a router and a Supabase browser client the moment
// it renders, and neither exists here. The nav's own job is whether it renders
// at all.
mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

const { MyNav } = await import("./my-nav");

const LABELS = [
  "Your account",
  "Your details",
  "Log your hours",
  "Your emails",
];

function nav() {
  return screen.getByRole("navigation", { name: "Your account" });
}

describe("MyNav", () => {
  test("renders every destination, in order, on every page", () => {
    render(<MyNav current="details" />);

    expect(
      Array.from(nav().children).map((element) => element.textContent?.trim()),
    ).toEqual(LABELS);
  });

  // The old row hid "Log your hours" from anyone with no volunteering behind
  // them -- the person who most needs to learn that logging hours is a thing
  // here. Membership does not vary, so there is nothing to pass in to vary it.
  test("offers hours to somebody who has never volunteered", () => {
    render(<MyNav current="home" />);

    expect(
      within(nav()).getByRole("link", { name: "Log your hours" }),
    ).toHaveAttribute("href", "/my/hours");
  });

  test("marks the current page and does not link it to itself", () => {
    render(<MyNav current="notifications" />);

    expect(within(nav()).getByText("Your emails")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      within(nav()).queryByRole("link", { name: "Your emails" }),
    ).toBeNull();
    // Every other entry stays a link.
    expect(within(nav()).getAllByRole("link")).toHaveLength(LABELS.length - 1);
  });

  test("omits sign-out by default, and renders it when asked", () => {
    const { rerender } = render(<MyNav current="home" showSignOut={false} />);
    expect(
      within(nav()).queryByRole("button", { name: /sign out/i }),
    ).toBeNull();

    rerender(<MyNav current="home" showSignOut />);
    expect(
      within(nav()).getByRole("button", { name: /sign out/i }),
    ).toBeInTheDocument();
  });
});
