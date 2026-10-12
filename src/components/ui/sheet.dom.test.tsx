import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { PortalDeviceProvider } from "@/lib/portal/device-context";
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

function sheet(side?: "left" | "right" | "bottom", className?: string) {
  render(
    <Sheet open>
      <SheetContent side={side} className={className}>
        <SheetTitle>Edit donation</SheetTitle>
      </SheetContent>
    </Sheet>,
  );
  return document.querySelector("[data-slot=sheet-content]")!;
}

// #1561: on a phone there are no side sheets. The primitive decides it, so no
// call site -- form, detail, filter or nav -- can ship one by forgetting.
describe("SheetContent on a phone", () => {
  for (const side of ["left", "right"] as const) {
    test(`a ${side} sheet opens from the bottom in the portal`, () => {
      render(
        <PortalDeviceProvider device="mobile">
          <Sheet open>
            <SheetContent side={side} className="w-[85%] sm:max-w-xl">
              <SheetTitle>Menu</SheetTitle>
            </SheetContent>
          </Sheet>
        </PortalDeviceProvider>,
      );
      const content = document.querySelector("[data-slot=sheet-content]")!;
      expect(content).toHaveAttribute("data-side", "bottom");
      // A desktop width the call site set must not anchor the drawer left.
      expect(content.className).toContain("w-full");
      expect(content.className).not.toContain("w-[85%]");
      expect(content.className).not.toContain("sm:max-w-xl");
      expect(content.className).toContain("data-[side=bottom]:h-[92dvh]");
    });
  }

  test("the portal's desktop answer keeps the side, whatever the viewport", () => {
    const width = window.innerWidth;
    window.innerWidth = 390;
    try {
      render(
        <PortalDeviceProvider device="desktop">
          <Sheet open>
            <SheetContent side="right">
              <SheetTitle>Edit</SheetTitle>
            </SheetContent>
          </Sheet>
        </PortalDeviceProvider>,
      );
      expect(
        document.querySelector("[data-slot=sheet-content]"),
      ).toHaveAttribute("data-side", "right");
    } finally {
      window.innerWidth = width;
    }
  });

  // The public site has no device class (its pages are cached per host), so
  // the viewport decides there.
  test("outside the portal a narrow viewport opens from the bottom", () => {
    const width = window.innerWidth;
    window.innerWidth = 390;
    try {
      expect(sheet("right")).toHaveAttribute("data-side", "bottom");
    } finally {
      window.innerWidth = width;
    }
  });

  test("outside the portal a wide viewport keeps the side", () => {
    expect(sheet("right")).toHaveAttribute("data-side", "right");
  });

  test("a sheet already at the bottom keeps its own classes", () => {
    render(
      <PortalDeviceProvider device="mobile">
        <Sheet open>
          <SheetContent side="bottom" className="h-[60dvh]">
            <SheetTitle>Door</SheetTitle>
          </SheetContent>
        </Sheet>
      </PortalDeviceProvider>,
    );
    const content = document.querySelector("[data-slot=sheet-content]")!;
    expect(content.className).toContain("h-[60dvh]");
    expect(content.className).not.toContain("rounded-t-xl");
  });

  test("its footer clears the home indicator", () => {
    expect(footer().className).toContain(
      "group-data-[side=bottom]/sheet:pb-[max(env(safe-area-inset-bottom),1rem)]",
    );
  });
});
