import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "@/components/ui/button";
import { PortalDeviceProvider } from "@/lib/portal/device-context";
import {
  PortalFormSurface,
  PortalFormSurfaceClose,
  type PortalFormSurfaceProps,
} from "./portal-form-surface";

function renderSurface(props: Partial<PortalFormSurfaceProps> = {}) {
  const onSubmit = mock(() => {});
  render(
    <PortalFormSurface
      open
      title="Check in a walk-in"
      description="Check in someone who didn't pre-register."
      onSubmit={onSubmit}
      footer={<Button type="submit">Check in walk-in</Button>}
      {...props}
    >
      <label htmlFor="party-size">Party size</label>
      <input id="party-size" name="partySize" defaultValue="1" />
    </PortalFormSurface>,
  );
  return { onSubmit };
}

const dialogContent = () =>
  document.querySelector("[data-slot=dialog-content]");
const sheetContent = () => document.querySelector("[data-slot=sheet-content]");

// The whole point of #1115: the device class is decided once on the server and
// read here, so a phone never paints a centred dialog and swaps it.
describe("which surface renders", () => {
  test("a desk gets the dialog", () => {
    renderSurface({ device: "desktop" });
    expect(dialogContent()).not.toBeNull();
    expect(sheetContent()).toBeNull();
  });

  test("a phone gets the sheet", () => {
    renderSurface({ device: "mobile" });
    expect(sheetContent()).not.toBeNull();
    expect(dialogContent()).toBeNull();
  });

  test("the layout's device class decides when no prop is passed", () => {
    render(
      <PortalDeviceProvider device="mobile">
        <PortalFormSurface
          open
          title="Add an expense"
          onSubmit={() => {}}
          footer={<Button type="submit">Save</Button>}
        >
          <input aria-label="Amount" />
        </PortalFormSurface>
      </PortalDeviceProvider>,
    );
    expect(sheetContent()).not.toBeNull();
  });

  // With no provider above it -- the public site, a unit test -- the surface
  // behaves exactly as it did before this existed, which is the same default
  // and the same reason as `deviceClass()`'s own fallback.
  test("defaults to the dialog with no provider and no prop", () => {
    renderSurface();
    expect(dialogContent()).not.toBeNull();
  });

  test("an explicit prop beats the provider", () => {
    render(
      <PortalDeviceProvider device="mobile">
        <PortalFormSurface
          open
          device="desktop"
          title="Add an expense"
          onSubmit={() => {}}
          footer={<Button type="submit">Save</Button>}
        >
          <input aria-label="Amount" />
        </PortalFormSurface>
      </PortalDeviceProvider>,
    );
    expect(dialogContent()).not.toBeNull();
    expect(sheetContent()).toBeNull();
  });
});

describe("the sheet branch", () => {
  test("comes up from the bottom", () => {
    renderSurface({ device: "mobile" });
    expect(sheetContent()?.getAttribute("data-side")).toBe("bottom");
  });

  // This is the one assertion that is really about tailwind-merge rather than
  // about this component. `sheetContentVariants` sets
  // `data-[side=bottom]:h-auto`, and a bare `h-[92dvh]` loses to it on
  // specificity *and* survives the merge, because tailwind-merge only resolves
  // a conflict between classes carrying the same modifiers. Carrying the
  // modifier is what removes `h-auto`. Get this wrong and the sheet is
  // content-height, the footer has nothing to pin against, and nothing else in
  // this file notices.
  test("is tall enough for the footer to pin against", () => {
    renderSurface({ device: "mobile" });
    const className = sheetContent()?.className ?? "";
    expect(className).toContain("data-[side=bottom]:h-[92dvh]");
    expect(className).not.toContain("data-[side=bottom]:h-auto");
  });

  test("rounds the edge it comes up from", () => {
    renderSurface({ device: "mobile" });
    expect(sheetContent()?.className).toContain("rounded-t-xl");
  });

  // `sheet.tsx` says the call site has to supply this and cannot see from
  // there whether it did. Owning it is half of why this component exists.
  test("makes the body the only scroller", () => {
    renderSurface({ device: "mobile" });
    const body = document.querySelector(
      "[data-slot=portal-form-surface-body]",
    )!;
    for (const cls of ["min-h-0", "flex-1", "overflow-y-auto"]) {
      expect(body.className).toContain(cls);
    }
  });

  test("keeps the footer clear of the home indicator", () => {
    renderSurface({ device: "mobile" });
    const footer = document.querySelector("[data-slot=sheet-footer]")!;
    expect(footer.className).toContain(
      "pb-[max(env(safe-area-inset-bottom),1rem)]",
    );
  });
});

describe("the dialog branch", () => {
  test("takes the width 41 of the 58 call sites already wanted", () => {
    renderSurface({ device: "desktop" });
    expect(dialogContent()?.className).toContain("sm:max-w-lg");
  });

  test("lets a call site pick another width", () => {
    renderSurface({ device: "desktop", size: "2xl" });
    const className = dialogContent()?.className ?? "";
    expect(className).toContain("sm:max-w-2xl");
    expect(className).not.toContain("sm:max-w-lg");
  });
});

// The migration's worst footgun, closed by construction rather than by a rule:
// because the footer sits inside the form on both branches, a plain
// `type="submit"` submits, and no call site has to carry a `form={id}`
// attribute whose absence would fail silently and with no type error.
describe("the submit button reaches the form", () => {
  for (const device of ["desktop", "mobile"] as const) {
    test(`submits from the footer on ${device}`, async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderSurface({ device });

      const form = screen
        .getByRole("button", { name: "Check in walk-in" })
        .closest("form");
      expect(form).not.toBeNull();

      await user.click(
        screen.getByRole("button", { name: "Check in walk-in" }),
      );
      expect(onSubmit).toHaveBeenCalled();
    });
  }
});

describe("opening and closing", () => {
  test("renders a trigger the caller supplies", async () => {
    const user = userEvent.setup();
    render(
      <PortalFormSurface
        trigger={
          <Button type="button" variant="secondary">
            Check in
          </Button>
        }
        title="Check in a walk-in"
        onSubmit={() => {}}
        footer={<Button type="submit">Save</Button>}
        device="desktop"
      >
        <input aria-label="Party size" />
      </PortalFormSurface>,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Check in" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  // The command palette offers these actions by name and has no button to hang
  // a trigger off (#979), so the same component has to render without one.
  test("renders no trigger when the caller drives it", () => {
    renderSurface({
      device: "desktop",
      withTrigger: false,
      trigger: <Button>Never</Button>,
    });
    expect(screen.queryByRole("button", { name: "Never" })).toBeNull();
  });

  // The concrete payoff of the shared base-ui module: one close works under
  // the sheet popup as well as the dialog one, so a migrated call site's
  // Cancel keeps firing the reset-on-close its `onOpenChange` does.
  for (const device of ["desktop", "mobile"] as const) {
    test(`cancel closes on ${device}`, async () => {
      const user = userEvent.setup();
      const onOpenChange = mock(() => {});
      renderSurface({
        device,
        onOpenChange,
        footer: (
          <PortalFormSurfaceClose render={<Button variant="secondary" />}>
            Cancel
          </PortalFormSurfaceClose>
        ),
      });

      await user.click(screen.getByRole("button", { name: "Cancel" }));
      // One argument, not base-ui's `(open, eventDetails)`: `useControlledOpen`
      // narrows it, and every existing call site's handler is written to that
      // signature. Anything here that wanted the close *reason* would have to
      // widen that hook rather than reach around it.
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  }
});
