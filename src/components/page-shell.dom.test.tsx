import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { PageShell } from "./page-shell";

describe("PageShell", () => {
  // Issue #595: PageShell supplies the <main> for every public section that
  // wraps it, so it is where the skip link's target has to live.
  test("renders a focusable skip-link target", () => {
    const { container } = render(<PageShell>content</PageShell>);

    const main = container.querySelector("main");
    expect(main).not.toBeNull();
    expect(main?.id).toBe("main-content");
    // Without tabIndex the anchor jump moves the scroll position but leaves
    // focus on the link, so the next Tab returns to the header.
    expect(main?.getAttribute("tabindex")).toBe("-1");
  });

  // Issue #1218: one column for the whole public site, with no prop to
  // override it, so every page's left edge lands on the header's.
  test("renders one fixed column", () => {
    const { container } = render(<PageShell>content</PageShell>);

    expect(container.querySelector(".max-w-6xl")).not.toBeNull();
  });
});
