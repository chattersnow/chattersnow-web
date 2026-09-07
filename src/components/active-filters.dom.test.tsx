import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { ActiveFilters } from "./active-filters";

const FILTERS = [
  { param: "search", label: "Search", value: "jacket" },
  { param: "status", label: "Status", value: "Available" },
];

describe("ActiveFilters", () => {
  test("renders nothing when the list isn't filtered", () => {
    const { container } = render(
      <ActiveFilters
        action="/portal/inventory/items"
        filters={[]}
        params={{}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("names each active filter, which the Filters count alone never did", () => {
    render(
      <ActiveFilters
        action="/portal/inventory/items"
        filters={FILTERS}
        params={{ search: "jacket", status: "available" }}
      />,
    );
    expect(screen.getByText("jacket")).toBeInTheDocument();
    expect(screen.getByText("Available")).toBeInTheDocument();
  });

  test("removing one filter keeps the others", () => {
    render(
      <ActiveFilters
        action="/portal/inventory/items"
        filters={FILTERS}
        params={{
          search: "jacket",
          status: "available",
          type: "all",
          sort: "created_at",
        }}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Remove Status filter" }),
    ).toHaveAttribute(
      "href",
      "/portal/inventory/items?search=jacket&sort=created_at",
    );
    expect(
      screen.getByRole("link", { name: "Remove Search filter" }),
    ).toHaveAttribute(
      "href",
      "/portal/inventory/items?status=available&sort=created_at",
    );
  });

  test("offers Clear all only when there's more than one to clear", () => {
    const { rerender } = render(
      <ActiveFilters
        action="/portal/people"
        filters={[FILTERS[0]]}
        params={{ search: "jacket" }}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Clear all" }),
    ).not.toBeInTheDocument();

    rerender(
      <ActiveFilters
        action="/portal/people"
        filters={FILTERS}
        params={{ search: "jacket", status: "available" }}
      />,
    );
    expect(screen.getByRole("button", { name: "Clear all" })).toHaveAttribute(
      "href",
      "/portal/people",
    );
  });
});
