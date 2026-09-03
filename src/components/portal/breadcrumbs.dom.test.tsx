import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";

let pathname = "/portal/people/person-1";
const actualNavigation = await import("next/navigation");
mock.module("next/navigation", () => ({
  ...actualNavigation,
  usePathname: () => pathname,
}));

const { PortalBreadcrumbs } = await import("./breadcrumbs");

function trail(path: string, current: string) {
  pathname = path;
  const { unmount } = render(<PortalBreadcrumbs current={current} />);
  const items = screen
    .getByRole("navigation", { name: "Breadcrumb" })
    .querySelectorAll("li");
  const labels = Array.from(items).map((li) => li.textContent?.trim());
  unmount();
  return labels;
}

describe("PortalBreadcrumbs", () => {
  test("names the section for a flat detail route", () => {
    expect(trail("/portal/people/person-1", "Ada Lovelace")).toEqual([
      "People",
      "Ada Lovelace",
    ]);
  });

  test("gives a three-level route the full trail, not one hop back", () => {
    expect(
      trail(
        "/portal/administration/access-management/assets/asset-1",
        "Mailchimp",
      ),
    ).toEqual(["Administration", "Access Management", "Mailchimp"]);
  });

  test("disambiguates the two Donations pages by their section", () => {
    expect(trail("/portal/inventory/donations/d-1", "Ada Lovelace")).toEqual([
      "Inventory",
      "Donations",
      "Ada Lovelace",
    ]);
    expect(trail("/portal/finance/donations", "Donations")).toEqual([
      "Finance",
      "Donations",
    ]);
  });

  test("drops a sub-item that just repeats its section's name", () => {
    // Calendar's first sub-item is also called Calendar; "Calendar > Calendar
    // > X" adds a step that says nothing.
    expect(trail("/portal/calendar/item-1", "Spring launch post")).toEqual([
      "Calendar",
      "Spring launch post",
    ]);
  });

  test("marks the current page and links only the ancestors", () => {
    pathname = "/portal/governance/meetings/m-1";
    render(<PortalBreadcrumbs current="March 3, 2026" />);
    expect(screen.getByRole("link", { name: "Governance" })).toHaveAttribute(
      "href",
      "/portal/governance/board-members",
    );
    expect(screen.getByRole("link", { name: "Meetings" })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "March 3, 2026" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("March 3, 2026")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
