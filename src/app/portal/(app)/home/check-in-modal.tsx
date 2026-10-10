"use client";

import { useState } from "react";
import { RegistrantsTab } from "../events/registrants-tab";
import { RegistrantsToolbar } from "../events/registrants-toolbar";
import { listEventRegistrantsAction } from "../events/registrants-actions";
import { getEventImpactDerivedAction } from "../events/impact-derived-actions";
import { DoorCheckIn } from "./door-check-in";
import { useTabData } from "@/hooks/use-tab-data";
import { usePortalDevice } from "@/lib/portal/device-context";
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
  // #1558. A phone gets a door list of its own; the desk keeps the card. The
  // proxy's device class, not a width test, so the sheet never opens as one
  // and repaints as the other.
  const mobile = usePortalDevice() === "mobile";
  // The event detail page feeds RegistrantsTab from its phase provider; this
  // modal renders outside those tabs, so it does the same two reads itself.
  // They are gated on `open` because the portal home renders one of these per
  // upcoming event, and none of them should fetch until it's opened.
  const registrants = useTabData(
    () => listEventRegistrantsAction(eventId),
    [eventId],
    open,
  );
  // Only the card's summary reads this, and the door list has no summary.
  const derived = useTabData(
    () => getEventImpactDerivedAction(eventId),
    [eventId],
    open && !mobile,
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
      {mobile ? (
        // Full width: the sheet's own default leaves a quarter of a phone
        // showing the dimmed dashboard behind it.
        <SheetContent
          side="right"
          size="lg"
          showCloseButton={false}
          className="gap-0 data-[side=right]:w-full"
        >
          <DoorCheckIn
            eventId={eventId}
            eventName={eventName}
            capacity={capacity}
            registrants={registrants}
            onChanged={registrants.refresh}
          />
        </SheetContent>
      ) : (
        <SheetContent side="right" size="lg">
          <SheetHeader>
            <SheetTitle>Check in &middot; {eventName}</SheetTitle>
            <SheetDescription>
              Check off registrants as they arrive, or add a walk-in.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <RegistrantsTab
              eventId={eventId}
              eventName={eventName}
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
      )}
    </Sheet>
  );
}
