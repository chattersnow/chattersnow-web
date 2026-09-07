import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Pagination } from "./pagination";

const hrefFor = (page: number) =>
  `/portal/people?q=ann&role=donor&page=${page}`;

describe("Pagination", () => {
  test("shows the record range alongside the page number", () => {
    render(
      <Pagination page={3} totalPages={32} count={312} hrefFor={hrefFor} />,
    );
    // The total was always fetched to compute totalPages; it just was never
    // shown, so "Page 3 of 32" gave no sense of how many records that was.
    expect(screen.getByText(/Showing 21–30 of 312/)).toBeTruthy();
    expect(screen.getByText(/Page 3 of 32/)).toBeTruthy();
  });

  test("clamps the range on the last page", () => {
    // 312 records over ten-row pages leaves the last one holding two.
    render(
      <Pagination page={32} totalPages={32} count={312} hrefFor={hrefFor} />,
    );
    expect(screen.getByText(/Showing 311–312 of 312/)).toBeTruthy();
  });

  test("counts the range in whatever page size it was given", () => {
    // The range has to follow the reader's rows-per-page choice, not the
    // default, or the summary contradicts the rows on screen.
    render(
      <Pagination
        page={3}
        totalPages={13}
        count={312}
        pageSize={25}
        hrefFor={hrefFor}
      />,
    );
    expect(screen.getByText(/Showing 51–75 of 312/)).toBeTruthy();
  });

  test("offers the rows-per-page choice at the size in play", () => {
    render(
      <Pagination
        page={1}
        totalPages={13}
        count={312}
        pageSize={25}
        hrefFor={hrefFor}
        perPageHrefFor={(perPage) => `/portal/people?perPage=${perPage}&page=1`}
      />,
    );
    expect(
      screen.getByRole("combobox", { name: "Rows per page" }),
    ).toHaveTextContent("25");
  });

  test("offers no rows-per-page choice unless the list can honour one", () => {
    // The control navigates, so a list that has nowhere to send the reader
    // must not render it at all.
    render(<Pagination page={1} totalPages={3} count={30} hrefFor={hrefFor} />);
    expect(
      screen.queryByRole("combobox", { name: "Rows per page" }),
    ).toBeNull();
  });

  test("offers a jump form that keeps the page's filters", () => {
    const { container } = render(
      <Pagination page={3} totalPages={32} count={312} hrefFor={hrefFor} />,
    );
    const form = container.querySelector("form");
    expect(form?.getAttribute("action")).toBe("/portal/people");
    // Every param except the page itself rides along as a hidden input, so
    // jumping lands on the same filtered list the Previous/Next links do.
    const hidden = Array.from(
      form!.querySelectorAll<HTMLInputElement>('input[type="hidden"]'),
    ).map((input) => [input.name, input.value]);
    expect(hidden).toEqual([
      ["q", "ann"],
      ["role", "donor"],
    ]);
    const jump = screen.getByLabelText("Go to page") as HTMLInputElement;
    expect(jump.name).toBe("page");
    expect(jump.max).toBe("32");
    expect(jump.value).toBe("3");
  });

  test("skips the jump form and the range when there is little to jump to", () => {
    const { container } = render(
      <Pagination page={1} totalPages={2} hrefFor={hrefFor} />,
    );
    expect(container.querySelector("form")).toBeNull();
    expect(screen.queryByText(/Showing/)).toBeNull();
    expect(screen.getByText(/Page 1 of 2/)).toBeTruthy();
  });
});
