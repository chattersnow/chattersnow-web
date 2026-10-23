import {
  CARPOOL_CARD_HEADING,
  CARPOOL_LINK_LABEL,
  NOT_IN_A_CAR_YET,
  carpoolAssignmentLines,
  type CarpoolAssignment,
} from "@/lib/carpool-assignment";
import {
  copyParagraphHtml,
  escapeHtml,
  joinHtmlLines,
  joinTextBlocks,
} from "@/lib/notifications/auto-reply-email";
import {
  carpoolCostNoticeHtml,
  carpoolCostNoticeText,
} from "@/lib/notifications/carpool-cost-notice-email";
import {
  emailPalette,
  EMPTY_EMAIL_BRANDING,
  renderEmailShell,
  type EmailBranding,
} from "@/lib/notifications/email-shell";
import type { RenderedEmail } from "@/lib/notifications/rendered-email";
import { CHANGE_ANSWERS_LINK_LABEL } from "@/lib/registration-answer-requests";
import { reminderIntro } from "@/lib/event-reminders";
import { DATE_TIME_WITH_ZONE, formatDateTimeInZone } from "@/lib/time";

/**
 * The reminder a registrant gets N days before the event (#1652): when and
 * where, in the event's own zone and labelled, their carpool (#1651) on an
 * event that organizes them, and a fresh answers link (#1591) -- the newest
 * email always works, and close to the day is when plans change.
 *
 * The carpool section is the assignment email's lines and notice, built from
 * carpool_assignment_card(), so it shows nothing about a car-mate the card
 * would not: no phone, email or preferred contact detail.
 */

export const EVENT_REMINDER_ACCOUNT_LINK_LABEL = "See your registration";

export type EventReminderMessage = {
  orgName: string;
  /** Blank is allowed and degrades the greeting. */
  firstName: string;
  eventName: string;
  startsAt: string;
  endsAt: string | null;
  /** events.timezone: every time here is shown in it, labelled. */
  timeZone: string;
  location: string | null;
  /** events.reminder_intro; null reads the platform default. */
  intro: string | null;
  /**
   * Null on an event without carpools. On one with them, `car` is null for a
   * registrant in no car yet.
   */
  carpool: { car: CarpoolAssignment | null; notice: readonly string[] } | null;
  /** Absolute, token included. Null where none could be issued. */
  answersLink: { url: string; expiresAt: string } | null;
  /** `/my/registration/[id]`, absolute, for a tenant with accounts on. */
  accountUrl: string | null;
  siteUrl: string;
  branding?: EmailBranding;
};

export function eventReminderSubject(
  eventName: string,
  startsAt: string,
  timeZone: string,
): string {
  const day = formatDateTimeInZone(
    startsAt,
    timeZone,
    { weekday: "long", month: "long", day: "numeric" },
    "en-US",
  );
  return `Reminder: ${eventName.trim() || "your event"} is on ${day}`;
}

/**
 * What the message history keeps: the details and the carpool lines, never
 * the link, whose token must not be stored.
 */
export function eventReminderSummary(message: EventReminderMessage): string {
  return [
    ...detailRows(message).map(([label, value]) => `${label}: ${value}`),
    ...carpoolText(message).split("\n").filter(Boolean),
  ].join("\n");
}

export function renderEventReminderEmail(
  message: EventReminderMessage,
): RenderedEmail {
  const branding = message.branding ?? EMPTY_EMAIL_BRANDING;
  const palette = emailPalette(branding);
  const firstName = message.firstName.trim();
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const intro = reminderIntro(message.intro);
  const rows = detailRows(message);
  const link = message.answersLink;
  const linkNote = link
    ? `Plans changed? Use this link to change your answers or how we reach you${message.carpool ? ", or to see your carpool" : ""}, until ${inEventZone(link.expiresAt, message.timeZone)}. It's just for you, so please don't forward it — it replaces any earlier link we sent.`
    : "";
  const signoff = `— ${message.orgName}`;
  const linkLabel = message.carpool
    ? CARPOOL_LINK_LABEL
    : CHANGE_ANSWERS_LINK_LABEL;

  const text = joinTextBlocks([
    greeting,
    [intro, ...rows.map(([label, value]) => `  ${label}: ${value}`)].join("\n"),
    carpoolText(message),
    message.carpool?.car ? carpoolCostNoticeText(message.carpool.notice) : "",
    link ? `${linkLabel}: ${link.url}\n${linkNote}` : "",
    message.accountUrl
      ? `${EVENT_REMINDER_ACCOUNT_LINK_LABEL}: ${message.accountUrl}`
      : "",
    signoff,
  ]);

  const listHtml = (items: [string, string][]) =>
    [
      `  <ul style="margin: 0 0 20px; padding-left: 20px;">`,
      ...items.map(
        ([label, value]) =>
          `      <li style="margin: 0 0 4px;"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`,
      ),
      `  </ul>`,
    ].join("\n");

  const linkHtml = (url: string, label: string) =>
    `  <p style="margin: 0 0 4px;"><a href="${escapeHtml(url)}" style="color: ${palette.link}; font-weight: 600; text-decoration: underline;">${escapeHtml(label)}</a></p>`;

  const carpool = message.carpool;
  const carpoolHtml = carpool
    ? [
        `  <p style="margin: 0 0 8px;"><strong>${escapeHtml(CARPOOL_CARD_HEADING)}</strong></p>`,
        carpool.car
          ? listHtml(
              carpoolAssignmentLines(carpool.car, message.orgName).map(
                ({ label, value }) => [label, value],
              ),
            )
          : `  <p style="margin: 0 0 20px;">${escapeHtml(NOT_IN_A_CAR_YET)}</p>`,
        carpool.car ? carpoolCostNoticeHtml(carpool.notice) : "",
      ].join("\n")
    : "";

  const html = renderEmailShell({
    orgName: message.orgName,
    siteUrl: message.siteUrl,
    branding,
    bodyHtml: joinHtmlLines([
      `  <p style="margin: 0 0 16px;">${escapeHtml(greeting)}</p>`,
      copyParagraphHtml(intro, "margin: 0 0 8px;"),
      listHtml(rows),
      carpoolHtml,
      link
        ? [
            linkHtml(link.url, linkLabel),
            `  <p style="color: ${palette.muted}; font-size: 14px; margin: 0 0 20px;">${escapeHtml(linkNote)}</p>`,
          ].join("\n")
        : "",
      message.accountUrl
        ? linkHtml(message.accountUrl, EVENT_REMINDER_ACCOUNT_LINK_LABEL)
        : "",
      `  <p style="color: ${palette.muted}; margin: 12px 0 0;">${escapeHtml(signoff)}</p>`,
    ]),
  });

  return {
    subject: eventReminderSubject(
      message.eventName,
      message.startsAt,
      message.timeZone,
    ),
    text,
    html,
  };
}

/** What, when and where. A place the event has none of is left out. */
function detailRows(message: EventReminderMessage): [string, string][] {
  const starts = inEventZone(message.startsAt, message.timeZone);
  const rows: [string, string][] = [
    ["What", message.eventName],
    [
      "When",
      message.endsAt
        ? `${starts} – ${inEventZone(message.endsAt, message.timeZone)}`
        : starts,
    ],
  ];
  const location = message.location?.trim();
  if (location) rows.push(["Where", location]);
  return rows;
}

function carpoolText(message: EventReminderMessage): string {
  const carpool = message.carpool;
  if (!carpool) return "";
  if (!carpool.car) return `${CARPOOL_CARD_HEADING}:\n  ${NOT_IN_A_CAR_YET}`;
  return [
    `${CARPOOL_CARD_HEADING}:`,
    ...carpoolAssignmentLines(carpool.car, message.orgName).map(
      ({ label, value }) => `  ${label}: ${value}`,
    ),
  ].join("\n");
}

function inEventZone(iso: string, timeZone: string): string {
  return formatDateTimeInZone(iso, timeZone, DATE_TIME_WITH_ZONE, "en-US");
}
