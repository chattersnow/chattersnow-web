import {
  CARPOOL_LINK_LABEL,
  carpoolAssignmentLines,
  type CarpoolAssignment,
} from "@/lib/carpool-assignment";
import {
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
import { DATE_TIME_WITH_ZONE, formatDateTimeInZone } from "@/lib/time";

/**
 * A registrant's carpool assignment (#1651), emailed by staff from the
 * carpool board to everyone in a car: the same lines as the "Your carpool"
 * card, the cost-split notice (#1650), and their answers link (#1591), so
 * they can see later changes and change their own answers.
 *
 * Nothing about a car-mate beyond what the card shows -- a first name, a
 * handle and a party size -- and nothing about the recipient they did not
 * give the organization themselves.
 */

export type CarpoolAssignmentMessage = {
  orgName: string;
  /** Blank is allowed and degrades the greeting. */
  firstName: string;
  eventName: string;
  car: CarpoolAssignment;
  notice: readonly string[];
  /**
   * Their fresh answers link, absolute and token included, and when it stops
   * working. Null -- the event has ended, or it could not be issued -- sends
   * the assignment without one.
   */
  answersLink: { url: string; expiresAt: string } | null;
  /** events.timezone, for when the link stops working (#1057). */
  timeZone: string;
  siteUrl: string;
  branding?: EmailBranding;
};

export function carpoolAssignmentSubject(eventName: string): string {
  return `Your carpool for ${eventName.trim() || "the event"}`;
}

/**
 * The card's lines alone, as the message history keeps them: the email minus
 * the link, whose token must never be stored.
 */
export function carpoolAssignmentSummary(
  car: CarpoolAssignment,
  orgName: string,
): string {
  return carpoolAssignmentLines(car, orgName)
    .map(({ label, value }) => `${label}: ${value}`)
    .join("\n");
}

export function renderCarpoolAssignmentEmail(
  message: CarpoolAssignmentMessage,
): RenderedEmail {
  const branding = message.branding ?? EMPTY_EMAIL_BRANDING;
  const palette = emailPalette(branding);
  const firstName = message.firstName.trim();
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const eventName = message.eventName.trim() || "the event";
  const intro = `Here's your carpool for ${eventName}.`;
  const lines = carpoolAssignmentLines(message.car, message.orgName);
  const link = message.answersLink;
  const linkNote = link
    ? `Use this link to see your carpool if it changes, or to change your own answers, until ${formatDateTimeInZone(link.expiresAt, message.timeZone, DATE_TIME_WITH_ZONE, "en-US")}. It's just for you, so please don't forward it — it replaces any earlier link we sent.`
    : "";
  const signoff = `— ${message.orgName}`;

  const text = joinTextBlocks([
    greeting,
    [intro, ...lines.map(({ label, value }) => `  ${label}: ${value}`)].join(
      "\n",
    ),
    carpoolCostNoticeText(message.notice),
    link ? `${CARPOOL_LINK_LABEL}: ${link.url}\n${linkNote}` : "",
    signoff,
  ]);

  const html = renderEmailShell({
    orgName: message.orgName,
    siteUrl: message.siteUrl,
    branding,
    bodyHtml: joinHtmlLines([
      `  <p style="margin: 0 0 16px;">${escapeHtml(greeting)}</p>`,
      `  <p style="margin: 0 0 8px;">${escapeHtml(intro)}</p>`,
      `  <ul style="margin: 0 0 20px; padding-left: 20px;">`,
      ...lines.map(
        ({ label, value }) =>
          `      <li style="margin: 0 0 4px;"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`,
      ),
      `  </ul>`,
      carpoolCostNoticeHtml(message.notice),
      link
        ? [
            `  <p style="margin: 0 0 4px;"><a href="${escapeHtml(link.url)}" style="color: ${palette.link}; font-weight: 600; text-decoration: underline;">${escapeHtml(CARPOOL_LINK_LABEL)}</a></p>`,
            `  <p style="color: ${palette.muted}; font-size: 14px; margin: 0 0 20px;">${escapeHtml(linkNote)}</p>`,
          ].join("\n")
        : "",
      `  <p style="color: ${palette.muted}; margin: 12px 0 0;">${escapeHtml(signoff)}</p>`,
    ]),
  });

  return { subject: carpoolAssignmentSubject(eventName), text, html };
}
