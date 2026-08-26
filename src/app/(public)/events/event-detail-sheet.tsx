"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EventRegistrationForm } from "./event-registration-form-fields";
import { checkRegistrationWindow } from "./event-registration-form";
import type { PublicEvent } from "./event-card";
import { EventSponsors } from "./event-sponsors";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "full",
  timeStyle: "short",
});

export function EventDetailSheet({
  event,
  open,
  onOpenChange,
}: {
  event: PublicEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const registrationWindow = event ? checkRegistrationWindow(event) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="data-[side=right]:sm:max-w-lg">
        {event && (
          <>
            <SheetHeader>
              <p className="app-eyebrow">{event.event_type ?? "Event"}</p>
              <SheetTitle className="text-xl">{event.name}</SheetTitle>
              <SheetDescription>
                {dateFormatter.format(new Date(event.starts_at))}
                {event.ends_at &&
                  ` – ${dateFormatter.format(new Date(event.ends_at))}`}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {(event.venue || event.location) && (
                <p className="app-muted text-sm">
                  {event.venue ?? event.location}
                </p>
              )}
              {event.description && (
                <p className="mt-4 text-sm leading-relaxed">
                  {event.description}
                </p>
              )}

              <EventSponsors sponsors={event.sponsors} />

              {event.registration_enabled && (
                <div className="mt-6">
                  <h3 className="brand-display text-lg font-semibold tracking-[-0.02em]">
                    Register
                  </h3>
                  <div className="mt-4">
                    {registrationWindow?.open ? (
                      <EventRegistrationForm eventId={event.id} />
                    ) : (
                      <p className="app-muted text-sm">
                        {registrationWindow?.reason}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
