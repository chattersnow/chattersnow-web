import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { SearchField } from "./search-field";

function form() {
  return screen.getByRole("searchbox").closest("form") as HTMLFormElement;
}

describe("SearchField", () => {
  test("submits to the page's own route as a GET", () => {
    render(
      <SearchField
        action="/portal/people"
        defaultValue=""
        placeholder="Search name, email, phone..."
      />,
    );
    expect(form()).toHaveAttribute("method", "get");
    expect(form()).toHaveAttribute("action", "/portal/people");
  });

  test("carries the sheet's other active filters through the search", () => {
    render(
      <SearchField
        action="/portal/inventory/items"
        defaultValue="jacket"
        placeholder="Search description..."
        preserve={{
          type: "jacket",
          condition: "all",
          status: "",
          sort: "created_at",
        }}
      />,
    );
    const hidden = Array.from(
      form().querySelectorAll<HTMLInputElement>('input[type="hidden"]'),
    ).map((input) => [input.name, input.value]);

    // "all" and "" both mean "not filtering on this", so neither is carried.
    expect(hidden).toEqual([
      ["type", "jacket"],
      ["sort", "created_at"],
    ]);
  });

  // Rendered with the codebase's standard `Button render={<Link/>}` pattern,
  // which reports role="button" rather than "link".
  test("offers a clear control only once something is searched, keeping the filters", () => {
    const { rerender } = render(
      <SearchField
        action="/portal/people"
        defaultValue=""
        placeholder="Search..."
        preserve={{ role: "is_donor" }}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Clear search" }),
    ).not.toBeInTheDocument();

    rerender(
      <SearchField
        action="/portal/people"
        defaultValue="ada"
        placeholder="Search..."
        preserve={{ role: "is_donor" }}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Clear search" }),
    ).toHaveAttribute("href", "/portal/people?role=is_donor");
  });
});
