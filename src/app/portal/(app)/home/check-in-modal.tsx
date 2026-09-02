"use client";

import { useState } from "react";
import { RegistrantsTab } from "../events/registrants-tab";
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
            eventId={eventId}
            capacity={capacity}
            active={open}
            mode="edit"
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
