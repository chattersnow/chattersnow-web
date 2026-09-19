"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { EventDetailVariant } from "./event-detail-content";

/** Fields, in document order, ignoring the honeypot and anything hidden. */
const FIRST_FIELD_SELECTOR =
  'input:not([type="hidden"]):not([tabindex="-1"]), select, textarea';

/**
 * Registering is a decision, so the form waits to be asked for (#1256).
 *
 * The sheet is the case that hurt -- on a phone the first thing below the
 * event's title was `Name`, before the reader had been told what they were
 * signing up for -- but a page whose form appears on demand and a sheet whose
 * form is always there would be two behaviours to keep in step, so both get
 * the same disclosure and `variant` picks nothing but type scale.
 *
 * Local state, not a route. The sheet itself is a URL (#847) because an event
 * is worth sharing; "I have started filling in a form" is not, and pushing
 * history for it would put Back between the reader and the listing.
 *
 * The panel is hidden rather than unmounted so that collapsing it does not
 * throw away what has been typed, and so `aria-controls` always names an
 * element that exists.
 */
export function EventRegistrationDisclosure({
  variant,
  children,
}: {
  variant: EventDetailVariant;
  children: ReactNode;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    // Focus first, so a keyboard or screen-reader user is not left standing at
    // the bottom of a page that silently grew; scroll second, so the field
    // lands somewhere deliberate inside the sheet's `overflow-y-auto` column
    // rather than wherever focus happened to drag it.
    panel.querySelector<HTMLElement>(FIRST_FIELD_SELECTOR)?.focus({
      preventScroll: true,
    });
    panel.scrollIntoView({ block: "nearest" });
  }, [open]);

  return (
    <div>
      <Button
        type="button"
        variant="rainbow"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className={variant === "page" ? "w-full sm:w-fit" : "w-full"}
      >
        Register
      </Button>
      <div ref={panelRef} id={panelId} hidden={!open} className="mt-6">
        {children}
      </div>
    </div>
  );
}
