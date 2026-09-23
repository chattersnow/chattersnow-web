import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatDateTimeInZone } from "@/lib/time";
import { publicGiveawayRulesPath } from "@/lib/giveaway-rules-path";
import { getEventGiveawayRulesLink } from "@/lib/giveaway-rules-publication";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSite } from "@/lib/public-site";
import { loadEventWaiver } from "./event-waiver-data";
import { EventWaiver } from "./event-waiver";
import { MY_PATH_PREFIX } from "@/lib/constituent/paths";
import { eventProgramsLabel, type PublicEvent } from "./event-card";
import { EventFlierFull } from "./event-flier";
import { EventRegistrationDisclosure } from "./event-registration-disclosure";
import { checkRegistrationWindow } from "./event-registration-form";
import { EventRegistrationForm } from "./event-registration-form-fields";
import { EventSponsors } from "./event-sponsors";
import { MyEventRegistrationForm } from "./my-registration-form";
import {
  loadEventViewer,
  loadRegistrationAccountOffer,
  type EventViewer,
} from "./my-registration";
import type { AccountOffer } from "@/lib/constituent/account-offer";

// Not the shared DATE_TIME_WITH_ZONE: the detail page spells the date out in
// full where a card abbreviates it. The zone name is the part that matters and
// is the same either way (#1064).
const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  // Components rather than `dateStyle`/`timeStyle`, which Intl refuses to
  // combine with `timeZoneName`. This is `dateStyle: "full"` plus the short
  // time and the zone the event is in.
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
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
  const page = variant === "page";

  return (
    <EventFlierFull
      flierUrl={event.flier_url}
      alt={event.name}
      sizes={
        page
          ? "(min-width: 768px) 768px, 100vw"
          : "(min-width: 640px) 32rem, 100vw"
      }
      // The page's flier is its hero image and the largest paint on it; the
      // sheet's arrives with an overlay that is already on screen.
      priority={page}
      align={page ? "start" : "center"}
      className={page ? "mb-6" : "mb-4"}
    />
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
  viewer,
  accountOffer,
  giveawayRulesId,
  waiver,
  waiverBlock,
  minorAccompaniment,
  photoConsent,
}: {
  event: PublicEvent;
  variant: EventDetailVariant;
  viewer: EventViewer | null;
  accountOffer: AccountOffer | null;
  /** The promotion whose official rules this event serves, if any (#1322). */
  giveawayRulesId: string | null;
  /**
   * The version of the participant agreement being shown, which the form
   * posts back so the RPC can refuse a submission made against text that has
   * since been republished (#686). Null where the tenant takes no waiver.
   */
  waiver: { version: number } | null;
  /** That agreement, already rendered on the server. Null with `waiver`. */
  waiverBlock: React.ReactNode;
  /**
   * This organization's rule for a party that includes anyone under 18
   * (#685), shown once somebody answers yes. Empty on a tenant that has
   * written none, which is the state every tenant starts in.
   */
  minorAccompaniment: string[];
  /**
   * This organization's photos-and-video paragraphs (#599, #1376), shown as a
   * notice on the registration form. There is no box: registering carries the
   * agreement, and objecting happens afterwards. Empty on a tenant that has
   * written none, and empty means the form says nothing at all about photos --
   * exactly what it rendered before #599 shipped.
   */
  photoConsent: string[];
}) {
  const page = variant === "page";
  const registrationWindow = checkRegistrationWindow(event);
  // Only a linked constituent can have one to find: `my_event_registration()`
  // looks the caller up through their `people` row, so an account without one
  // is never "already registered" as far as this page can tell.
  const existingRegistration =
    viewer?.kind === "linked" ? viewer.registration : null;

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

      {giveawayRulesId && (
        /* In the flow the rules govern, not only in a footer: somebody about
           to enter a promotion has to be able to read what they are entering
           before they do (#666, #1322). */
        <p className={page ? "mt-8 text-sm" : "mt-6 text-sm"}>
          <Link
            href={publicGiveawayRulesPath(giveawayRulesId)}
            className="underline underline-offset-4"
          >
            Official rules for the giveaway at this event
          </Link>
        </p>
      )}

      {event.registration_enabled && (
        /* No "Register" heading above this any more (#1256): the button is
           the heading's job now, and a heading over a status sentence
           ("you're registered", "the deadline has passed") only announced a
           form that is not there. */
        <section className={page ? "mt-10 max-w-lg" : "mt-6"}>
          {existingRegistration ? (
            /* Already signed up. Showing the state instead of a second form
               is the point of knowing who is reading: the database would
               refuse the duplicate anyway, and being told "you are already
               registered" after filling a form in is a worse way to learn
               it.

               There is no "cancel" here, and deliberately not. #1165 made
               that conditional on the existing model supporting it, and it
               does not: `event_registrations` has no cancelled state and no
               delete path anywhere in the application, staff included, so
               the only thing a button could do is destroy the row -- taking
               the attendance figure and the discount code with it. Changing
               your mind is a message to the organization until there is a
               model for it. */
            <div className="space-y-2">
              <Alert>
                <div className="rainbow-accent mb-2 w-10" />
                <AlertDescription>
                  You&apos;re registered
                  {existingRegistration.party_size > 1
                    ? `, for ${existingRegistration.party_size} of you`
                    : ""}
                  . If you can no longer make it, let us know.
                </AlertDescription>
              </Alert>
              <p className="app-muted text-sm">
                <Link href={MY_PATH_PREFIX} className="underline">
                  See this on your account
                </Link>
              </p>
            </div>
          ) : !registrationWindow.open ? (
            <p className="app-muted text-sm">{registrationWindow.reason}</p>
          ) : (
            <EventRegistrationDisclosure variant={variant}>
              {viewer?.kind === "linked" ? (
                <MyEventRegistrationForm
                  eventId={event.id}
                  person={viewer.person}
                  waiver={waiver}
                  waiverBlock={waiverBlock}
                  minorAccompaniment={minorAccompaniment}
                  photoConsent={photoConsent}
                />
              ) : (
                /* Signed in without an approved claim (#1162) still registers
                   down the anonymous path, and still mints or matches a
                   `people` row -- it just does not have to be told its own
                   name and address to do it (#1257). */
                <EventRegistrationForm
                  eventId={event.id}
                  account={viewer?.kind === "account" ? viewer.account : null}
                  accountOffer={accountOffer}
                  waiver={waiver}
                  waiverBlock={waiverBlock}
                  minorAccompaniment={minorAccompaniment}
                  photoConsent={photoConsent}
                />
              )}
            </EventRegistrationDisclosure>
          )}
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
export async function EventDetailContent({
  event,
  variant,
}: {
  event: PublicEvent;
  variant: EventDetailVariant;
}) {
  // Loaded here rather than by each caller, so the page and the sheet cannot
  // drift into showing a signed-in visitor two different things about the same
  // registration. Null for everyone with no session at all, which is most
  // visitors and costs them one `getUser()`.
  const viewer = await loadEventViewer(event.id);
  // What the registration can offer afterwards (#1258), decided here for the
  // same reason the viewer is: the page and the sheet must not drift into two
  // different answers about the same registration.
  const accountOffer = await loadRegistrationAccountOffer(viewer);
  // Whether this event's promotion has published rules to point at. Loaded
  // here for the same reason the viewer is: the page and the sheet must not
  // drift into two different answers.
  const supabase = await createSupabaseServerClient();
  const giveawayRules = await getEventGiveawayRulesLink(supabase, event.id);
  // The participant agreement, if this organization takes one (#686). Rendered
  // here on the server and handed down as an element, so a whole legal
  // document and the markup parser stay out of the client bundle -- and, for
  // the tenants that have adopted none, so does everything: `loadEventWaiver`
  // returns null off a read the footer already made.
  const waiver = await loadEventWaiver(supabase);
  // This organization's rule for a party that includes anyone under 18
  // (#685). Off the same `cache()`d `getPublicSite()` read the layout and the
  // footer already made, so it costs no query; empty on a tenant that has
  // written none, which leaves the form saying only what it asks for.
  const { content } = await getPublicSite(supabase);
  const minorAccompaniment = content.paragraphs("events.minor_accompaniment");
  // And this organization's photo and media consent scope (#599), off the same
  // read. Empty on a tenant that has written none, which is almost all of
  // them, and empty means the form asks nothing about photographs at all --
  // not an empty box, not a heading. Read here rather than in the client
  // component for the reason the waiver is: a block of tenant prose has no
  // business in the browser bundle of the tenants that have none.
  const photoConsent = content.paragraphs("events.photo_consent");
  const waiverBlock = waiver ? (
    <EventWaiver
      doc={waiver.content}
      version={waiver.version}
      headingId="event-waiver-title"
    />
  ) : null;

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
          <EventDetailBody
            event={event}
            variant="sheet"
            viewer={viewer}
            accountOffer={accountOffer}
            giveawayRulesId={giveawayRules?.giveawayId ?? null}
            waiver={waiver ? { version: waiver.version } : null}
            waiverBlock={waiverBlock}
            minorAccompaniment={minorAccompaniment}
            photoConsent={photoConsent}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <EventFlier event={event} variant="page" />
      <section>
        <p className="app-eyebrow">{eventProgramsLabel(event.programs)}</p>
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          {event.name}
        </h1>
        <p className="app-muted mt-4 text-sm sm:text-base">
          {formatWhen(event)}
        </p>
      </section>
      <EventDetailBody
        event={event}
        variant="page"
        viewer={viewer}
        accountOffer={accountOffer}
        giveawayRulesId={giveawayRules?.giveawayId ?? null}
        waiver={waiver ? { version: waiver.version } : null}
        waiverBlock={waiverBlock}
        minorAccompaniment={minorAccompaniment}
        photoConsent={photoConsent}
      />
    </>
  );
}
