import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Pagination } from "./pagination";

const hrefFor = (page: number) =>
  `/portal/people?q=ann&role=donor&page=${page}`;

describe("Pagination", () => {
  test("shows the record range alongside the page number", () => {
    render(
      <Pagination page={3} totalPages={7} count={312} hrefFor={hrefFor} />,
    );
    // The total was always fetched to compute totalPages; it just was never
    // shown, so "Page 3 of 7" gave no sense of how many records that was.
    expect(screen.getByText(/Showing 101–150 of 312/)).toBeTruthy();
    expect(screen.getByText(/Page 3 of 7/)).toBeTruthy();
  });

  test("clamps the range on the last page", () => {
    render(
      <Pagination page={7} totalPages={7} count={312} hrefFor={hrefFor} />,
    );
    expect(screen.getByText(/Showing 301–312 of 312/)).toBeTruthy();
  });

  test("offers a jump form that keeps the page's filters", () => {
    const { container } = render(
      <Pagination page={3} totalPages={7} count={312} hrefFor={hrefFor} />,
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
    expect(jump.max).toBe("7");
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
