"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-[var(--purple-deep)]/10 dark:bg-black/50 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          // `max-h-[85vh] overflow-y-auto` is a default rather than something
          // each dialog opts into (#884). The popup is `fixed` and centred by
          // a -50% translate, so without a cap a form taller than the viewport
          // runs off both ends -- and since the popup is not a scroll container
          // and the page behind a modal does not scroll, the submit button
          // becomes unreachable. 42 of the 54 call sites were already pasting
          // this in by hand; the four that forgot did so by omission, and one
          // of them (#883) shipped a dialog nobody could finish.
          //
          // Being the scroll container also makes this the element a sticky
          // descendant pins to, which `DialogFooter` now relies on (#1094) to
          // keep the submit button visible on a tall form. See the note on Card
          // in ./card.tsx for the same relationship in the other direction,
          // where an unintended scroll container captured a sticky header.
          //
          // A call site can still size itself: tailwind-merge resolves the
          // `max-h`/`overflow` conflict in favour of the passed className.
          "fixed top-1/2 left-1/2 z-50 grid max-h-[85vh] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        // `sticky bottom-0` pins the primary action to the bottom of the popup
        // (#1094). Since #884 the scroll container is `DialogContent` itself,
        // which is what a sticky descendant resolves against, so on a form
        // taller than 85vh the footer stays put while the body scrolls beneath
        // it; on a short dialog there is nothing to scroll and it sits in flow
        // exactly as before.
        //
        // `bg-muted/50` is translucent, so the `before` layer puts an opaque
        // `bg-popover` behind it -- without that, scrolled fields read through
        // the footer.
        //
        // The offset is `-bottom-4`, not `bottom-0`, because sticky resolves
        // against the scrollport -- `DialogContent`'s padding box, 1rem inside
        // the popup's edge -- and pins the border box, not the margin box, so
        // the `-mb-4` that reaches the rounded edge in normal flow buys nothing
        // while pinned. `bottom-0` leaves the footer hovering 1rem up with a
        // strip of scrolling form under it (measured in Chrome at 1280x800).
        "sticky -bottom-4 z-10 -mx-4 -mb-4 mt-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 before:absolute before:inset-0 before:-z-10 before:rounded-b-xl before:bg-popover sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className,
      )}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
