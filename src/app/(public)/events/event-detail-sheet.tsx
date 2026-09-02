"use client";

import Image from "next/image";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { checkRegistrationWindow } from "./event-registration-form";
import type { PublicEvent } from "./event-card";
import { EventSponsors } from "./event-sponsors";
import { formatDateTimeInZone } from "@/lib/time";
import { resolveImageUrl } from "@/lib/inventory";

const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: "full",
  timeStyle: "short",
};

export function EventDetailSheet({
  event,
  open,
  onOpenChange,
  onRegister,
}: {
  event: PublicEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRegister: (event: PublicEvent) => void;
}) {
  const registrationWindow = event ? checkRegistrationWindow(event) : null;
  const imageUrl = event ? resolveImageUrl(event.flier_url) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        {event && (
          <>
            <SheetHeader>
              <p className="app-eyebrow">{event.event_type ?? "Event"}</p>
              <SheetTitle className="text-xl">{event.name}</SheetTitle>
              <SheetDescription>
                {formatDateTimeInZone(
                  event.starts_at,
                  event.timezone,
                  DATE_FORMAT_OPTIONS,
                  "en-US",
                )}
                {event.ends_at &&
                  ` – ${formatDateTimeInZone(event.ends_at, event.timezone, DATE_FORMAT_OPTIONS, "en-US")}`}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {imageUrl && (
                <div className="relative mb-4 aspect-[16/9] w-full overflow-hidden rounded-lg bg-muted">
                  <Image
                    src={imageUrl}
                    alt={event.name}
                    fill
                    sizes="(min-width: 640px) 32rem, 100vw"
                    className="object-cover"
                  />
                </div>
              )}
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
                      <Button onClick={() => onRegister(event)}>
                        Register for this event
                      </Button>
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
