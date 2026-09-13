import Image from "next/image";
import {
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatDateTimeInZone } from "@/lib/time";
import { resolveImageUrl } from "@/lib/inventory";
import { eventProgramsLabel, type PublicEvent } from "./event-card";
import { checkRegistrationWindow } from "./event-registration-form";
import { EventRegistrationForm } from "./event-registration-form-fields";
import { EventSponsors } from "./event-sponsors";

const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: "full",
  timeStyle: "short",
};

/** Where a detail view is being rendered: its own page, or the sheet over the listing. */
export type EventDetailVariant = "page" | "sheet";

/** The start (and end, when there is one) in the event's own zone. */
function formatWhen(event: PublicEvent): string {
  const starts = formatDateTimeInZone(
    event.starts_at,
    event.timezone,
    DATE_FORMAT_OPTIONS,
    "en-US",
  );
  if (!event.ends_at) return starts;
  return `${starts} – ${formatDateTimeInZone(event.ends_at, event.timezone, DATE_FORMAT_OPTIONS, "en-US")}`;
}

function EventFlier({
  event,
  variant,
}: {
  event: PublicEvent;
  variant: EventDetailVariant;
}) {
  const imageUrl = resolveImageUrl(event.flier_url);
  if (!imageUrl) return null;

  const page = variant === "page";

  return (
    <div
      className={`relative aspect-[16/9] w-full overflow-hidden rounded-lg bg-muted ${page ? "mb-6" : "mb-4"}`}
    >
      <Image
        src={imageUrl}
        alt={event.name}
        fill
        sizes={
          page
            ? "(min-width: 768px) 768px, 100vw"
            : "(min-width: 640px) 32rem, 100vw"
        }
        className="object-cover"
        // The page's flier is its hero image and the largest paint on it; the
        // sheet's arrives with an overlay that is already on screen.
        priority={page}
      />
    </div>
  );
}

/**
 * Everything below the title: where and what it is, who is sponsoring it, and
 * how to register. The two presentations differ only in type scale and
 * spacing, which is what `variant` picks -- the content itself is one tree, so
 * a change to what an event says shows up in both places at once.
 */
function EventDetailBody({
  event,
  variant,
}: {
  event: PublicEvent;
  variant: EventDetailVariant;
}) {
  const page = variant === "page";
  const registrationWindow = checkRegistrationWindow(event);

  return (
    <>
      {event.location && (
        <p className={`app-muted ${page ? "text-sm sm:text-base" : "text-sm"}`}>
          {event.location}
        </p>
      )}
      {event.description && (
        <p
          className={
            page
              ? "mt-6 max-w-2xl text-sm leading-relaxed sm:text-base"
              : "mt-4 text-sm leading-relaxed"
          }
        >
          {event.description}
        </p>
      )}

      <EventSponsors sponsors={event.sponsors} />

      {event.registration_enabled && (
        <section className={page ? "mt-10 max-w-lg" : "mt-6"}>
          {page ? (
            <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
              Register
            </h2>
          ) : (
            <h3 className="brand-display text-lg font-semibold tracking-[-0.02em]">
              Register
            </h3>
          )}
          <div className="mt-4">
            {registrationWindow.open ? (
              <EventRegistrationForm eventId={event.id} />
            ) : (
              <p className="app-muted text-sm">{registrationWindow.reason}</p>
            )}
          </div>
        </section>
      )}
    </>
  );
}

/**
 * One event, rendered either as `/events/e/[id]`'s own page or as the sheet that
 * intercepts that URL over the listing (#847). A server component in both
 * cases: the client parts it reaches for (the registration form, sponsor
 * logos) draw their own boundaries.
 *
 * The `page` variant expects to be inside a `PageShell`; the `sheet` variant
 * expects to be inside a `SheetContent`, which is where `SheetTitle` gets the
 * dialog context it needs to become the sheet's accessible name.
 */
export function EventDetailContent({
  event,
  variant,
}: {
  event: PublicEvent;
  variant: EventDetailVariant;
}) {
  if (variant === "sheet") {
    return (
      <>
        <SheetHeader>
          <p className="app-eyebrow">{eventProgramsLabel(event.programs)}</p>
          <SheetTitle className="text-xl">{event.name}</SheetTitle>
          <SheetDescription>{formatWhen(event)}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <EventFlier event={event} variant="sheet" />
          <EventDetailBody event={event} variant="sheet" />
        </div>
      </>
    );
  }

  return (
    <>
      <EventFlier event={event} variant="page" />
      <section>
        <p className="app-eyebrow">{eventProgramsLabel(event.programs)}</p>
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          {event.name}
        </h1>
        <p className="app-muted mt-4 text-sm sm:text-base">
          {formatWhen(event)}
        </p>
      </section>
      <EventDetailBody event={event} variant="page" />
    </>
  );
}
