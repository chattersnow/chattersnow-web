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

  test("mirrors the three-card upcoming grid, not the single bordered panel", () => {
    const { container } = render(<HomeLoading />);

    // The card placeholders carry the 16:9 flier slot the real cards do, and
    // there is one per column of the default grid (#846).
    const fliers = container.querySelectorAll(".aspect-\\[16\\/9\\]");
    expect(fliers).toHaveLength(3);

    expect(container.querySelector(".lg\\:grid-cols-3")).not.toBeNull();
    // The old skeleton was a single centred bordered panel.
    expect(container.querySelector("section.rounded-xl.border")).toBeNull();
    expect(container.querySelector(".aspect-video")).toBeNull();
  });
});
