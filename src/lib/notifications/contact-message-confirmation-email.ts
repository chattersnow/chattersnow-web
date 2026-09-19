import type { AutoReplyCopy } from "@/lib/notifications/auto-replies";
import {
  autoReplyWords,
  copyParagraphHtml,
  escapeHtml,
  joinHtmlLines,
  joinTextBlocks,
  requireAutoReplyDefinition,
} from "@/lib/notifications/auto-reply-email";
import { CONTACT_MESSAGE_CONFIRMATION_KIND } from "@/lib/notifications/kinds";
import type { RenderedEmail } from "@/lib/notifications/rendered-email";
import { formatDateTimeInZone } from "@/lib/time";

/**
 * The acknowledgement somebody gets after writing in through the public
 * contact form (#1237).
 *
 * Until this existed the form answered the organization and said nothing to
 * the person who filled it in: they got a page that said thanks, and their
 * inbox held no record that they had written and no reference to point at if
 * nobody ever answered. That is the whole job here -- there is no code to
 * carry and no status page to link, so the email's payload is two lines that
 * say "this is the thing you sent, and this is when we got it".
 *
 * **It echoes back the minimum**, and that is a rule rather than a first
 * draft. `run_retention_purge` (20260905120000) hard-deletes contact_messages
 * on a schedule, and an inbox is somewhere that clock cannot reach, so the
 * reasoning at the top of submission-emails.ts applies with more force here
 * than it does to the staff notice: the topic and the date, never the message
 * body and never the phone number. Somebody adding a field should have an
 * answer for that.
 *
 * Modelled on volunteer-application-confirmation-email.ts: addressed to the
 * person the row is about rather than to staff, with the wrapping -- subject,
 * greeting, intro, closing, sign-off -- the tenant's to write (#1233) and the
 * detail rows rendered here whatever that copy says. No "change what you get"
 * link, because whoever wrote in may hold no account to change it in.
 */

const DEFINITION = requireAutoReplyDefinition(
  CONTACT_MESSAGE_CONFIRMATION_KIND,
);

export type ContactMessageConfirmation = {
  orgName: string;
  /** What they typed on the form. Blank is allowed and degrades the greeting. */
  senderName: string;
  /**
   * The topic as this organization names it -- already through
   * `contactTopicLabel()`, because a tenant renames the one about what it
   * lends (#896) and the visitor picked that word on the form.
   */
  topicLabel: string;
  /** `contact_messages.created_at`, an ISO instant. */
  receivedAt: string;
  /**
   * The zone the date reads in: the organization's own (`org.timezone`).
   *
   * An email has no browser to infer a zone from and the server thinks in UTC,
   * so somebody has to choose one -- and unlike an event, a contact message
   * carries no zone of its own. The organization's is the reading that makes
   * "we got it on the 4th" agree with what its own staff see in the portal.
   */
  timeZone: string;
};

/** The date the message arrived: "September 19, 2026". */
const RECEIVED_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "long",
  day: "numeric",
};

/**
 * @param copy The tenant's resolved slots (resolveAutoReply). Omitted renders
 *   the platform's defaults, which is what a tenant with no row gets.
 */
export function renderContactMessageConfirmationEmail(
  confirmation: ContactMessageConfirmation,
  copy?: AutoReplyCopy,
): RenderedEmail {
  const words = autoReplyWords(DEFINITION, copy, {
    org_name: confirmation.orgName,
    first_name: confirmation.senderName,
  });
  const rows = detailRows(confirmation);

  // The rows sit against the intro with no blank line between them, so the
  // two are one block -- the shape the event confirmation uses.
  const details = [
    words.intro,
    ...rows.map(([label, value]) => `  ${label}: ${value}`),
  ]
    .filter(Boolean)
    .join("\n");

  const text = joinTextBlocks([
    words.greeting,
    details,
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
    copyParagraphHtml(words.closing, "margin: 0 0 12px;"),
    copyParagraphHtml(words.signoff, "color: #57534e; margin: 12px 0 0;"),
  ]);

  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1c1917; line-height: 1.5; max-width: 560px;">
${body}
</div>`;

  return { subject: words.subject, text, html };
}

/**
 * The labelled lines: what it was about, and when it landed. Both of them and
 * nothing else -- see the header.
 */
function detailRows(
  confirmation: ContactMessageConfirmation,
): [string, string][] {
  const rows: [string, string][] = [];
  const topic = confirmation.topicLabel.trim();
  // A message whose topic has since left the registry falls back to the stored
  // value upstream, so this is only ever empty for a row written by hand.
  if (topic) rows.push(["Topic", topic]);
  rows.push(["Received", receivedOn(confirmation)]);
  return rows;
}

/**
 * The locale is named rather than left to the environment, for the reason the
 * event confirmation names its own: this renders on a server whose default
 * locale is nobody's choice, and an unpinned one would make the same message
 * read differently between local dev and production.
 */
function receivedOn(confirmation: ContactMessageConfirmation): string {
  return formatDateTimeInZone(
    confirmation.receivedAt,
    confirmation.timeZone,
    RECEIVED_FORMAT,
    "en-US",
  );
}
