"use client";

import { useState } from "react";
import { RegistrantsTab } from "../events/registrants-tab";
import { RegistrantsToolbar } from "../events/registrants-toolbar";
import { listEventRegistrantsAction } from "../events/registrants-actions";
import { getEventImpactDerivedAction } from "../events/impact-derived-actions";
import { useTabData } from "@/hooks/use-tab-data";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function CheckInModal({
  eventId,
  eventName,
  capacity,
  triggerLabel = "Check in",
}: {
  eventId: string;
  eventName: string;
  capacity: number | null;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  // The event detail page feeds RegistrantsTab from its phase provider; this
  // modal renders outside those tabs, so it does the same two reads itself.
  // They are gated on `open` because the portal home renders one of these per
  // upcoming event, and none of them should fetch until it's opened.
  const registrants = useTabData(
    () => listEventRegistrantsAction(eventId),
    [eventId],
    open,
  );
  const derived = useTabData(
    () => getEventImpactDerivedAction(eventId),
    [eventId],
    open,
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            type="button"
            variant="secondary"
            className="shrink-0 whitespace-nowrap"
          />
        }
      >
        {triggerLabel}
      </SheetTrigger>
      <SheetContent side="right" size="lg">
        <SheetHeader>
          <SheetTitle>Check in &middot; {eventName}</SheetTitle>
          <SheetDescription>
            Check off registrants as they arrive, or add a walk-in.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <RegistrantsTab
            capacity={capacity}
            mode="edit"
            registrants={registrants}
            derived={derived}
            /* This sheet exists to work through the whole list, so it opts out
               of the card's five-row cap -- and a "View all" trigger here would
               only open a sheet on top of this one. */
            previewRows={null}
            headerActions={
              <RegistrantsToolbar
                eventId={eventId}
                onSaved={() => {
                  registrants.refresh();
                  derived.refresh();
                }}
              />
            }
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
