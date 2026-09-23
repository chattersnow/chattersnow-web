import { publicEventPath } from "@/app/(public)/events/event-path";
import type { AutoReplyCopy } from "@/lib/notifications/auto-replies";
import {
  autoReplyWords,
  copyParagraphHtml,
  escapeHtml,
  joinHtmlLines,
  joinTextBlocks,
  requireAutoReplyDefinition,
} from "@/lib/notifications/auto-reply-email";
import {
  emailPalette,
  EMPTY_EMAIL_BRANDING,
  renderEmailShell,
  type EmailBranding,
} from "@/lib/notifications/email-shell";
import { renderEventIcs } from "@/lib/notifications/event-ics";
import { EVENT_REGISTRATION_CONFIRMATION_KIND } from "@/lib/notifications/kinds";
import type { RenderedEmail } from "@/lib/notifications/rendered-email";
import { DATE_TIME_WITH_ZONE, formatDateTimeInZone } from "@/lib/time";

/**
 * The confirmation a registrant gets after signing up for a public event
 * (#1068): what they signed up for, when and where it is, how many of them are
 * coming, and a calendar file so it can leave the mailbox and land somewhere
 * they will see it again.
 *
 * The wrapping -- subject, greeting, intro, closing, sign-off -- is the
 * tenant's to write (#1234). The payload is not: the detail rows, the link to
 * the event and the attached calendar file are rendered here whatever the copy
 * says, because they are what the email is *for*. A tenant who has written
 * nothing gets the platform's wording, byte for byte what this file sent
 * before the slots existed.
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

const DEFINITION = requireAutoReplyDefinition(
  EVENT_REGISTRATION_CONFIRMATION_KIND,
);

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
  /**
   * The answer to the event's registration question (#1407), in the event's
   * order. Empty or omitted where the event asks none, which renders no row.
   */
  options?: { label: string; quantity: number }[];
  eventId: string;
  /** The tenant's own origin, from tenantMailContext(). */
  siteUrl: string;
  /**
   * The tenant's logo and colours (#1238), from the same context. Omitted
   * renders the platform's unbranded shell, which is what a tenant that has
   * set no branding gets anyway.
   */
  branding?: EmailBranding;
};

/**
 * @param copy The tenant's resolved slots (resolveAutoReply). Omitted renders
 *   the platform's defaults, which is what a tenant with no row gets.
 */
export function renderEventRegistrationConfirmationEmail(
  confirmation: EventRegistrationConfirmation,
  copy?: AutoReplyCopy,
): RenderedEmail {
  const { eventName } = confirmation;
  const branding = confirmation.branding ?? EMPTY_EMAIL_BRANDING;
  const palette = emailPalette(branding);
  const words = autoReplyWords(DEFINITION, copy, {
    org_name: confirmation.orgName,
    first_name: confirmation.registrantName,
    event_name: eventName,
  });
  const url = `${normalizeOrigin(confirmation.siteUrl)}${publicEventPath(confirmation.eventId)}`;
  const rows = detailRows(confirmation);
  const calendarNote =
    "A calendar file is attached, so you can add it to your own calendar.";

  // The rows sit against the intro with no blank line between them, so the
  // two are one block.
  const details = [
    words.intro,
    ...rows.map(([label, value]) => `  ${label}: ${value}`),
  ]
    .filter(Boolean)
    .join("\n");

  const text = joinTextBlocks([
    words.greeting,
    details,
    `Event details: ${url}`,
    calendarNote,
    words.closing,
    words.signoff,
  ]);

  const rowsHtml = rows
    .map(
      ([label, value]) =>
        `      <li style="margin: 0 0 4px;"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`,
    )
    .join("\n");

  const body = joinHtmlLines([
    copyParagraphHtml(words.greeting, "margin: 0 0 16px;"),
    copyParagraphHtml(words.intro, "margin: 0 0 8px;"),
    `  <ul style="margin: 0 0 20px; padding-left: 20px;">\n${rowsHtml}\n  </ul>`,
    `  <p style="margin: 0 0 12px;"><a href="${escapeHtml(url)}" style="color: ${palette.link}; font-weight: 600; text-decoration: underline;">See the event page</a></p>`,
    `  <p style="margin: 0 0 12px;">${escapeHtml(calendarNote)}</p>`,
    copyParagraphHtml(words.closing, "margin: 0 0 12px;"),
    copyParagraphHtml(
      words.signoff,
      `color: ${palette.muted}; margin: 12px 0 0;`,
    ),
  ]);

  const html = renderEmailShell({
    orgName: confirmation.orgName,
    siteUrl: confirmation.siteUrl,
    branding,
    bodyHtml: body,
  });

  return {
    subject: words.subject,
    text,
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
  const options = confirmation.options ?? [];
  if (options.length > 0) {
    rows.push([
      "Your choices",
      options
        .map((option) => `${option.quantity} × ${option.label}`)
        .join(", "),
    ]);
  }
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
