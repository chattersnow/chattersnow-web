"use client";

import { useId, type ReactElement, type ReactNode } from "react";
import type { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import type { DeviceClass } from "@/proxy";
import { usePortalDevice } from "@/lib/portal/device-context";
import {
  useControlledOpen,
  type ControlledOpenProps,
} from "@/components/portal/use-controlled-open";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/** Desktop widths -- the only axis any dialog call site varies today. */
const SIZE_CLASS = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
  "2xl": "sm:max-w-2xl",
} as const;

export type PortalFormSurfaceSize = keyof typeof SIZE_CLASS;

/**
 * The cancel button a footer renders, in either branch.
 *
 * `dialog.tsx` and `sheet.tsx` wrap the *same* `Dialog` primitive from
 * `@base-ui/react/dialog` -- same specifier, same module, same React context --
 * so one close works under either popup and a call site never has to know
 * which one it got.
 */
export { DialogClose as PortalFormSurfaceClose };

export type PortalFormSurfaceProps = ControlledOpenProps & {
  title: ReactNode;
  description?: ReactNode;
  /**
   * The button that opens it, as a whole element -- variant, size, classes and
   * label included, the way every dialog call site already writes its trigger.
   * Omitted (or `withTrigger={false}`) where the caller opens the surface
   * itself and has no button to hang a trigger off, as the command palette
   * does (#979).
   */
  trigger?: ReactElement;
  /** Desktop width. The sheet is full-bleed, so this does nothing on a phone. */
  size?: PortalFormSurfaceSize;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  /**
   * The footer's buttons, and only those: the border, the fill, the pin and
   * the safe-area padding come from here. A `type="submit"` button works
   * as-is on both branches -- see the note on the form below.
   */
  footer: ReactNode;
  /** Forwarded to whichever popup renders; the same base-ui prop on both. */
  initialFocus?: DialogPrimitive.Popup.Props["initialFocus"];
  /**
   * Overrides the layout's device class. Tests drive both branches with it,
   * and a server page that already holds one may pass it. Normally left alone.
   */
  device?: DeviceClass;
  /** The fields, normally a single `<FieldGroup>`. */
  children: ReactNode;
};

/**
 * One portal form, rendered as a sheet on a phone and a dialog at a desk,
 * chosen on the server (#1115).
 *
 * `dialog.tsx` is a good desktop dialog and a poor phone form: centred, capped
 * at `max-h-[85vh]`, it leaves dead space above and below and scrolls the form
 * inside a box that is itself inside a scrolling page. The fix was expensive
 * while "is this a phone?" was a client-side width test; since #1079 the proxy
 * decides it and `deviceClass()` reports it, so this branch costs no flash, no
 * hydration mismatch and no measurement. The device comes from
 * `usePortalDevice()` -- never `useIsMobile()`, whose own docblock explains it
 * answers `false` during SSR, which is the flash #1079 exists to remove.
 *
 * The two branches differ in less than they look like they do, because
 * `sheet.tsx` and `dialog.tsx` wrap the same base-ui `Dialog`. There is one
 * root, one trigger and one close here, and only the popup forks -- which is
 * also why `PortalFormSurfaceClose` works under both. Do not "tidy" the mobile
 * branch into a `Sheet` root with a `SheetClose`: it would still typecheck and
 * Cancel would keep working, but the two branches would stop being one dialog
 * with two skins, which is the thing that keeps them from drifting.
 *
 * It composes the existing primitives rather than reaching past them, so
 * #884's height cap and #1094's two footer pins stay defined in one place each
 * instead of being forked here.
 *
 * **What it actually hides.** A `Dialog` pins its footer with `sticky` inside a
 * scrolling popup; a `Sheet` pins it with `mt-auto` inside a fixed-height flex
 * column whose body must be `min-h-0 flex-1 overflow-y-auto` -- a dependency
 * `sheet.tsx`'s own comment calls invisible from there, and one a call site
 * that forgets pays for with a footer floating under its content. Owning the
 * `<form>` and the body wrapper is what lets one set of props satisfy both: on
 * the sheet branch the form *is* that flex column, so the footer stays inside
 * the form on both branches and an ordinary `type="submit"` reaches it without
 * a `form={id}` attribute. That is deliberate. Hanging the footer outside the
 * form would work too, and would mean every migrated call site had to remember
 * an attribute whose absence fails silently, with no type error.
 *
 * Four things decided once here, so no call site has to ask again:
 *
 * - **Bottom, not right.** A form slides up from the bottom, because that is
 *   where both the phone conventions and the thumb are. The nav sheet's
 *   `side="right"` answers a different question.
 * - **The tab bar needs no suppression.** `mobile-nav.tsx`'s bar is `z-30` and
 *   every overlay backdrop is `z-50`, so the sheet already covers it.
 * - **Destructive confirms stay centred on both.** `alert-dialog.tsx` is a
 *   question, not a task. Giving two lines 92% of the screen overstates it,
 *   and it would land "Delete" under the thumb that was on "Cancel" a moment
 *   ago. A confirm is not a form and does not belong here.
 * - **Non-form surfaces stay on `Dialog`** -- pickers, diff reviews, the
 *   agenda print preview, the onboarding carousel. The whole value here is
 *   form wiring, and a `form={false}` mode would be a second component hiding
 *   inside this one. If a second pattern proves out during the migration (most
 *   likely a tall read-only list), cut a lower-level surface then, with real
 *   call sites as the evidence.
 *
 * **Known rough edge.** On iOS the software keyboard does not shrink `dvh`, so
 * a field low in a long form can put the footer behind the keyboard. base-ui
 * already declines to focus the first field when a dialog is opened by touch,
 * so the keyboard is not up on open, and the scrolling body is what iOS scrolls
 * a focused input into. The real fix is `interactive-widget=resizes-content` on
 * the viewport meta, which has the same global blast radius as
 * `viewport-fit=cover` and the same reason not to be changed blind.
 */
export function PortalFormSurface({
  open: controlledOpen,
  onOpenChange,
  withTrigger = true,
  title,
  description,
  trigger,
  size = "lg",
  onSubmit,
  footer,
  initialFocus,
  device: deviceOverride,
  children,
}: PortalFormSurfaceProps) {
  const contextDevice = usePortalDevice();
  const device = deviceOverride ?? contextDevice;
  const [open, setOpen] = useControlledOpen(controlledOpen, onOpenChange);
  // Lets a caller put a submit button somewhere this component does not own.
  // Nothing needs it today. Note for anyone reaching for it in a test: React
  // 19's useId emits `«r0»`, which is a legal id and form attribute but not a
  // legal CSS selector -- find the form by role, not by `#id`.
  const formId = useId();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {withTrigger && trigger !== undefined && (
        <DialogTrigger render={trigger} />
      )}

      {device === "mobile" ? (
        // `data-[side=bottom]:h-[92dvh]`, not `h-[92dvh]`: the cva sets
        // `data-[side=bottom]:h-auto`, whose attribute selector outranks a bare
        // class on specificity no matter what order they land in -- and
        // tailwind-merge will not drop it either, because it only resolves a
        // conflict between classes carrying the same modifiers. Repeating the
        // modifier puts both in one group so `h-auto` is removed outright.
        // Without this the sheet is content-height and the footer pin, which
        // needs a column with a height to pin against, silently stops working.
        //
        // 92dvh rather than 100: the strip of backdrop left showing is what
        // says the sheet is dismissible, and it is what makes a rounded top
        // corner mean anything.
        <SheetContent
          side="bottom"
          className="data-[side=bottom]:h-[92dvh] rounded-t-xl"
          initialFocus={initialFocus}
        >
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            {description && <SheetDescription>{description}</SheetDescription>}
          </SheetHeader>

          <form
            id={formId}
            onSubmit={onSubmit}
            className="flex min-h-0 flex-1 flex-col"
          >
            {/* The only scroller on this branch -- the page behind a modal does
                not scroll, and nesting a second one is the thing #1115 exists
                to stop. `min-h-0` is load-bearing: a flex child otherwise
                refuses to shrink below its content, and the body pushes the
                footer off the bottom of the sheet. */}
            <div
              data-slot="portal-form-surface-body"
              className="min-h-0 flex-1 overflow-y-auto px-4 pb-4"
            >
              {children}
            </div>
            {/* `max(env(...), 1rem)` rather than the inset alone, for the reason
                spelled out on the tab bar in `shell/mobile-nav.tsx`: `env()`
                safe-area insets resolve to 0 until a page opts in with
                `viewport-fit=cover`, which this app does not. The constant
                clears the home indicator today and the inset takes over by
                itself if that is ever turned on. */}
            <SheetFooter className="pb-[max(env(safe-area-inset-bottom),1rem)]">
              {footer}
            </SheetFooter>
          </form>
        </SheetContent>
      ) : (
        <DialogContent className={SIZE_CLASS[size]} initialFocus={initialFocus}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && (
              <DialogDescription>{description}</DialogDescription>
            )}
          </DialogHeader>

          <form id={formId} onSubmit={onSubmit}>
            {children}
            <DialogFooter>{footer}</DialogFooter>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
