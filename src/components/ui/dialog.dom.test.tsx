import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Dialog, DialogContent, DialogTitle } from "./dialog";

function open(className?: string) {
  render(
    <Dialog open>
      <DialogContent className={className}>
        <DialogTitle>Open a call for artwork</DialogTitle>
      </DialogContent>
    </Dialog>,
  );
  return document.querySelector("[data-slot=dialog-content]")!;
}

// #884. The popup is `fixed` and centred with a -50% translate, so without a
// height cap a form taller than the viewport runs off both ends -- and because
// the popup is not a scroll container and the page behind a modal does not
// scroll, its submit button cannot be reached at all. #883 shipped exactly
// that. These pin the cap as a default rather than something 42 of 54 call
// sites remember to paste in.
describe("DialogContent height", () => {
  test("caps its height and scrolls, without being asked to", () => {
    const popup = open();
    expect(popup.className).toContain("max-h-[85vh]");
    expect(popup.className).toContain("overflow-y-auto");
  });

  test("still renders its content", () => {
    open();
    expect(screen.getByText("Open a call for artwork")).toBeTruthy();
  });

  // The default is only safe to impose if a call site can still get out of it,
  // and that rests on tailwind-merge resolving the conflict rather than
  // emitting both classes and letting stylesheet order decide.
  test("lets a call site override the cap", () => {
    const popup = open("max-h-[95vh]");
    expect(popup.className).toContain("max-h-[95vh]");
    expect(popup.className).not.toContain("max-h-[85vh]");
  });

  test("lets a call site turn scrolling off", () => {
    const popup = open("overflow-visible");
    expect(popup.className).toContain("overflow-visible");
    expect(popup.className).not.toContain("overflow-y-auto");
  });
});
