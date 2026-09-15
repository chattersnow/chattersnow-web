import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Button } from "./button";

// Issue #1117: the mobile shell's 44px hit area is selected in CSS by
// `[data-size^="icon"]`. Nothing in TypeScript reads that attribute, so
// deleting it would be a silent, phone-only regression -- this is the guard.
describe("Button's size attribute", () => {
  test("carries the size variant into the DOM", () => {
    render(<Button size="icon-sm">Edit</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("data-size", "icon-sm");
  });

  test("names the default size rather than omitting it", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("data-size", "default");
  });

  test("every icon size shares the prefix the CSS matches on", () => {
    const sizes = ["icon", "icon-xs", "icon-sm", "icon-lg"] as const;
    for (const size of sizes) {
      const { unmount } = render(<Button size={size} aria-label={size} />);
      expect(screen.getByLabelText(size).dataset.size).toStartWith("icon");
      unmount();
    }
  });
});
