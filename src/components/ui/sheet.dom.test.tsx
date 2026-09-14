import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { Sheet, SheetContent, SheetFooter, SheetTitle } from "./sheet";

function footer(className?: string) {
  render(
    <Sheet open>
      <SheetContent>
        <SheetTitle>Edit donation</SheetTitle>
        <SheetFooter className={className}>Save</SheetFooter>
      </SheetContent>
    </Sheet>,
  );
  return document.querySelector("[data-slot=sheet-footer]")!;
}

// #1094. All 35 call sites hand-wrote the same `flex-row ... border-t
// bg-muted/50` on top of a stacked, borderless default -- one style copied 35
// times, not a set of variants. The next sheet written from the primitive
// rather than by copy-paste used to come out looking like neither.
describe("SheetFooter", () => {
  test("supplies the house footer style without being asked to", () => {
    const className = footer().className;
    for (const cls of [
      "flex-row",
      "justify-end",
      "gap-2",
      "border-t",
      "bg-muted/50",
      "p-4",
    ]) {
      expect(className).toContain(cls);
    }
  });

  // `mt-auto` is the whole pinning mechanism inside `SheetContent`'s `h-full`
  // flex column -- the sheet's answer to the sticky footer a Dialog needs.
  test("keeps the pin that holds it against the bottom edge", () => {
    expect(footer().className).toContain("mt-auto");
  });

  // The seven sheets that put a destructive action opposite Save pass only the
  // axis they differ on now, and it has to win.
  test("lets a call site take the justification back", () => {
    const className = footer("justify-between").className;
    expect(className).toContain("justify-between");
    expect(className).not.toContain("justify-end");
  });
});
