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

  test("still honours a custom column width", () => {
    const { container } = render(
      <PageShell maxWidth="max-w-3xl">content</PageShell>,
    );

    expect(container.querySelector(".max-w-3xl")).not.toBeNull();
  });
});
