import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "./dialog";

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

// #1094. Being scrollable made the submit button reachable; it did not make it
// visible. On anything taller than 85vh the footer started below the fold with
// nothing to suggest the form continued, so the operator filled the last field
// they could see and stopped. The pin is what turns "reachable" into "there".
describe("DialogFooter", () => {
  function footer(className?: string) {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Add an event</DialogTitle>
          <DialogFooter className={className}>Save</DialogFooter>
        </DialogContent>
      </Dialog>,
    );
    return document.querySelector("[data-slot=dialog-footer]")!;
  }

  test("pins itself to the bottom of the popup", () => {
    expect(footer().className).toContain("sticky");
    expect(footer().className).toContain("-bottom-4");
  });

  // `bg-muted/50` is half transparent, so pinning it without an opaque layer
  // underneath would let the fields passing beneath read through the footer.
  test("carries an opaque layer under its translucent tint", () => {
    const className = footer().className;
    expect(className).toContain("before:bg-popover");
    expect(className).toContain("bg-muted/50");
  });

  test("still lets a call site override the layout", () => {
    const className = footer("sm:justify-between").className;
    expect(className).toContain("sm:justify-between");
    expect(className).not.toContain("sm:justify-end");
  });
});
