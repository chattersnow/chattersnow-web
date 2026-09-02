"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EventRegistrationForm } from "./event-registration-form-fields";
import type { PublicEvent } from "./event-card";

export function EventRegistrationSheet({
  event,
  open,
  onOpenChange,
}: {
  event: PublicEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        {event && (
          <>
            <SheetHeader>
              <SheetTitle className="text-xl">Register</SheetTitle>
              <SheetDescription>{event.name}</SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <EventRegistrationForm eventId={event.id} />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
