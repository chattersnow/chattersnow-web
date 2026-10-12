"use client";

import * as React from "react";
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useServerDevice } from "@/lib/portal/device-context";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { XIcon } from "lucide-react";

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-[var(--purple-deep)]/10 dark:bg-black/50 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs",
        className,
      )}
      {...props}
    />
  );
}

const sheetContentVariants = cva(
  "group/sheet fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-ending-style:opacity-0 data-starting-style:opacity-0 data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=bottom]:data-ending-style:translate-y-[2.5rem] data-[side=bottom]:data-starting-style:translate-y-[2.5rem] data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=left]:data-ending-style:translate-x-[-2.5rem] data-[side=left]:data-starting-style:translate-x-[-2.5rem] data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=right]:data-ending-style:translate-x-[2.5rem] data-[side=right]:data-starting-style:translate-x-[2.5rem] data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=top]:data-ending-style:translate-y-[-2.5rem] data-[side=top]:data-starting-style:translate-y-[-2.5rem]",
  {
    variants: {
      size: {
        sm: "data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm",
        md: "data-[side=left]:sm:max-w-lg data-[side=right]:sm:max-w-lg",
        lg: "data-[side=left]:sm:max-w-xl data-[side=right]:sm:max-w-xl",
        xl: "data-[side=left]:sm:max-w-[640px] data-[side=right]:sm:max-w-[640px]",
        "2xl":
          "data-[side=left]:sm:max-w-[880px] data-[side=right]:sm:max-w-[880px]",
      },
    },
    defaultVariants: {
      size: "md",
    },
  },
);

/**
 * What a side sheet becomes on a phone: full width, 92dvh, rounded top -- the
 * same drawer `PortalFormSurface` gives a form. Appended after the call site's
 * classes so a desktop width it set (`w-[85%]`, `sm:max-w-xl`) cannot leave the
 * drawer anchored to the left edge. `data-[side=bottom]:h-[92dvh]` rather than
 * a bare `h-` for the reason on `PortalFormSurface`'s phone branch: it has to outrank
 * the cva's own `data-[side=bottom]:h-auto`.
 */
const PHONE_SHEET_CLASS =
  "w-full max-w-none sm:max-w-none data-[side=bottom]:h-[92dvh] rounded-t-xl";

/**
 * The side a sheet actually opens from (#1561). **On a phone there are no side
 * sheets**: every one -- form, detail, preview, filter, nav -- slides up from
 * the bottom, where both the platform conventions and the thumb are. A right
 * sheet at 3/4 of a 390px screen is a cramped column beside a sliver of
 * dimmed page, and it is the one overlay a phone user cannot dismiss by
 * reaching for it.
 *
 * Decided here, in the primitive, so a call site cannot forget it: a `side`
 * prop is the desktop answer. In the portal the device is the server's
 * (`usePortalDevice()`'s source, #1079); the public site's pages are cached
 * per host rather than per device and carry no device class, so there it is
 * the viewport -- safe, since a sheet opens on a tap made after hydration.
 */
function useSheetSide(side: SheetSide): {
  side: SheetSide;
  phone: boolean;
} {
  const serverDevice = useServerDevice();
  const narrowViewport = useIsMobile();
  const phone = serverDevice ? serverDevice === "mobile" : narrowViewport;
  return { side: phone ? "bottom" : side, phone: phone && side !== "bottom" };
}

type SheetSide = "top" | "right" | "bottom" | "left";

function SheetContent({
  className,
  children,
  side: requestedSide = "right",
  size,
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props &
  VariantProps<typeof sheetContentVariants> & {
    /** The desktop side. A phone always gets `bottom` (`useSheetSide`). */
    side?: SheetSide;
    showCloseButton?: boolean;
  }) {
  const { side, phone } = useSheetSide(requestedSide);
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          sheetContentVariants({ size }),
          className,
          phone && PHONE_SHEET_CLASS,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <Tooltip>
            <SheetPrimitive.Close
              data-slot="sheet-close"
              render={
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      className="absolute top-3 right-3"
                      size="icon-sm"
                      aria-label="Close"
                    />
                  }
                />
              }
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </SheetPrimitive.Close>
            <TooltipContent>Close</TooltipContent>
          </Tooltip>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        // The house footer, matching `DialogFooter` (#1094). All 35 call sites
        // used to hand-write `flex-row ... border-t bg-muted/50` on top of an
        // older stacked default; that is one style, not a set of variants, so
        // it belongs here. Overrides stay for the handful that want
        // `justify-between` or `flex-wrap`.
        //
        // `mt-auto` is what pins the footer to the bottom of `SheetContent`'s
        // `h-full` flex column. It only holds if the call site renders the body
        // between header and footer as `flex-1 overflow-y-auto` -- a dependency
        // invisible from here. Without it the column is shorter than the sheet
        // and the footer floats up under the content.
        //
        // On a bottom sheet the footer is the screen's bottom edge, so it
        // clears the home indicator -- `max()` for the reason given on the tab
        // bar in `shell/mobile-nav.tsx` (the inset is 0 without
        // `viewport-fit=cover`).
        "mt-auto flex flex-row justify-end gap-2 border-t bg-muted/50 p-4 group-data-[side=bottom]/sheet:pb-[max(env(safe-area-inset-bottom),1rem)]",
        className,
      )}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-base font-medium text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
