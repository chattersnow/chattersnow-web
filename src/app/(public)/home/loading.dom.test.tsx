import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import HomeLoading from "./loading";

describe("HomeLoading", () => {
  test("mirrors the wide carousel hero instead of the old circular avatar", () => {
    const { container } = render(<HomeLoading />);

    expect(container.querySelector(".max-w-6xl")).not.toBeNull();
    expect(container.querySelector(".aspect-\\[21\\/9\\]")).not.toBeNull();
    expect(container.querySelector(".rounded-full")).toBeNull();
  });

  test("mirrors the bordered Next up event card instead of the small aspect-video block", () => {
    const { container } = render(<HomeLoading />);

    const card = container.querySelector("section.rounded-xl.border");
    expect(card).not.toBeNull();
    expect(container.querySelector(".aspect-video")).toBeNull();
  });
});
