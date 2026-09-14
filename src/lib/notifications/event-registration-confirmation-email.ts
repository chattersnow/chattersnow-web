import { publicEventPath } from "@/app/(public)/events/event-path";
import { renderEventIcs } from "@/lib/notifications/event-ics";
import type { RenderedEmail } from "@/lib/notifications/rendered-email";
import { DATE_TIME_WITH_ZONE, formatDateTimeInZone } from "@/lib/time";

/**
 * The confirmation a registrant gets after signing up for a public event
 * (#1068): what they signed up for, when and where it is, how many of them are
 * coming, and a calendar file so it can leave the mailbox and land somewhere
 * they will see it again.
 *
 * Modelled on gear-request-confirmation-email.ts. Like that one it is addressed
 * to the person the row is about rather than to staff, and like that one it
 * carries no "change what you get" link: there is no account to change it in.
 *
 * It deliberately echoes back neither the phone number nor the notes, for the
 * reason the gear confirmation omits the postal address: they typed both a
 * minute ago, and a copy sitting in a mailbox is one more copy outside the
 * retention clock. Someone adding a field here should have an answer for that.
 *
 * Every time reads in the *event's* own timezone with the zone named (#1057).
 * An email has no browser to infer a zone from, the server thinks in UTC, and
 * the event's local time is the only reading that is true for everybody. The
 * attached calendar file is the one place that uses UTC instead -- see
 * event-ics.ts for why the two are not in conflict.
 */

export type EventRegistrationConfirmation = {
  orgName: string;
  /** What they typed on the form. Blank is allowed and degrades the greeting. */
  registrantName: string;
  eventName: string;
  startsAt: string;
  endsAt: string | null;
  /** events.timezone, an IANA identifier. */
  timeZone: string;
  location: string | null;
  /**
   * The *total* headcount, the registrant included -- the form labels it
   * "Number attending" and register_for_event() sums it against the event's
   * capacity. So "you plus N" would overcount by one.
   */
  partySize: number;
  eventId: string;
  /** The tenant's own origin, from tenantMailContext(). */
  siteUrl: string;
};

export function renderEventRegistrationConfirmationEmail(
  confirmation: EventRegistrationConfirmation,
): RenderedEmail {
  const { orgName, eventName } = confirmation;
  const greeting = confirmation.registrantName
    ? `Hi ${confirmation.registrantName},`
    : "Hi,";
  const lead = `You're registered for ${eventName}. Here are the details:`;
  const url = `${normalizeOrigin(confirmation.siteUrl)}${publicEventPath(confirmation.eventId)}`;
  const rows = detailRows(confirmation);
  const calendarNote =
    "A calendar file is attached, so you can add it to your own calendar.";
  const closing =
    "If you can no longer make it, let us know so we can free up your spot.";

  const textLines = [
    greeting,
    "",
    lead,
    ...rows.map(([label, value]) => `  ${label}: ${value}`),
    "",
    `Event details: ${url}`,
    "",
    calendarNote,
    "",
    closing,
    "",
    `— ${orgName}`,
  ];

  const rowsHtml = rows
    .map(
      ([label, value]) =>
        `      <li style="margin: 0 0 4px;"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`,
    )
    .join("\n");

  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1c1917; line-height: 1.5; max-width: 560px;">
  <p style="margin: 0 0 16px;">${escapeHtml(greeting)}</p>
  <p style="margin: 0 0 8px;">${escapeHtml(lead)}</p>
  <ul style="margin: 0 0 20px; padding-left: 20px;">
${rowsHtml}
  </ul>
  <p style="margin: 0 0 12px;"><a href="${escapeHtml(url)}" style="color: #4c1d95; font-weight: 600; text-decoration: underline;">See the event page</a></p>
  <p style="margin: 0 0 12px;">${escapeHtml(calendarNote)}</p>
  <p style="margin: 0 0 12px;">${escapeHtml(closing)}</p>
  <p style="color: #57534e; margin: 12px 0 0;">— ${escapeHtml(orgName)}</p>
</div>`;

  return {
    subject: `You're registered for ${eventName}`,
    text: textLines.join("\n"),
    html,
    attachments: [
      {
        filename: "event.ics",
        contentType: "text/calendar; charset=utf-8; method=PUBLISH",
        content: renderEventIcs({
          uid: calendarUid(confirmation.eventId, confirmation.siteUrl),
          summary: eventName,
          startsAt: confirmation.startsAt,
          endsAt: confirmation.endsAt,
          location: confirmation.location,
          url,
        }),
      },
    ],
  };
}

/** The labelled lines, in order. A place the event has none of is left out. */
function detailRows(
  confirmation: EventRegistrationConfirmation,
): [string, string][] {
  const rows: [string, string][] = [
    ["What", confirmation.eventName],
    ["When", eventWindow(confirmation)],
  ];
  const location = confirmation.location?.trim();
  // Omitted rather than rendered as "TBD": the event page is linked below and
  // is the thing that will say so first when a place is finally chosen.
  if (location) rows.push(["Where", location]);
  rows.push(["Party size", partySizeText(confirmation.partySize)]);
  return rows;
}

/**
 * The start, and the end where the event has one. Both ends carry their own
 * zone label, so an event that runs across a DST change still reads correctly.
 */
function eventWindow(confirmation: EventRegistrationConfirmation): string {
  const starts = inEventZone(confirmation.startsAt, confirmation.timeZone);
  if (!confirmation.endsAt) return starts;
  return `${starts} – ${inEventZone(confirmation.endsAt, confirmation.timeZone)}`;
}

/**
 * The locale is named rather than left to the environment: this renders on a
 * server whose default locale is nobody's choice, and an unpinned one would
 * make the same event read differently between local dev and production.
 */
function inEventZone(iso: string, timeZone: string): string {
  return formatDateTimeInZone(iso, timeZone, DATE_TIME_WITH_ZONE, "en-US");
}

function partySizeText(partySize: number): string {
  return partySize > 1 ? `${partySize} people, including you` : "just you";
}

/**
 * The calendar entry's identity: the event, at the organization's own domain.
 * Not the registration -- see CalendarEvent.uid in event-ics.ts.
 */
function calendarUid(eventId: string, siteUrl: string): string {
  let host = "chattersnow-web";
  try {
    host = new URL(siteUrl).hostname || host;
  } catch {
    // An unparseable origin is somebody's misconfigured NEXT_PUBLIC_SITE_URL.
    // The uid only has to be unique and stable, so the fallback is harmless.
  }
  return `event-${eventId}@${host}`;
}

/** A trailing slash on a hand-typed origin would otherwise give "//events/e". */
function normalizeOrigin(siteUrl: string): string {
  return siteUrl.replace(/\/+$/, "");
}

/**
 * The event name and place were typed by staff in the portal and the
 * registrant's name came off a public form: all of it is text, none of it
 * markup.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
