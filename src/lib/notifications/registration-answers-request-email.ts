import {
  copyParagraphHtml,
  escapeHtml,
  joinHtmlLines,
  joinTextBlocks,
} from "@/lib/notifications/auto-reply-email";
import {
  emailPalette,
  EMPTY_EMAIL_BRANDING,
  renderEmailShell,
  type EmailBranding,
} from "@/lib/notifications/email-shell";
import type { RenderedEmail } from "@/lib/notifications/rendered-email";
import { DATE_TIME_WITH_ZONE, formatDateTimeInZone } from "@/lib/time";

/**
 * A registrant's own link to fill in an event's registration questions
 * (#1502), sent by staff to people who registered before the questions
 * existed.
 *
 * The intro is the staffer's, edited in the dialog; everything around it is
 * fixed, because the link and when it stops working are what the email is
 * for. It says the link is theirs alone -- it opens their answers, without a
 * sign-in -- and repeats nothing about the registration: a forwarded copy
 * should give away as little as the page behind it does.
 *
 * No "change what you get" link, for the reason the announcement has none:
 * there is no switch this message obeys but the organization's own.
 */

export type RegistrationAnswersRequest = {
  orgName: string;
  /** What to call them. Blank is allowed and degrades the greeting. */
  firstName: string;
  eventName: string;
  /** Plain text from the dialog; line breaks are theirs to place. */
  intro: string;
  /** The absolute link, token included. */
  url: string;
  /** When the link stops working, as an ISO instant. */
  expiresAt: string;
  /** events.timezone, so the date reads in the event's own zone (#1057). */
  timeZone: string;
  /** The tenant's own origin, from tenantMailContext(). */
  siteUrl: string;
  branding?: EmailBranding;
  /** The subject line; see answersRequestSubject(). */
  subject: string;
};

export function renderRegistrationAnswersRequestEmail(
  request: RegistrationAnswersRequest,
): RenderedEmail {
  const branding = request.branding ?? EMPTY_EMAIL_BRANDING;
  const palette = emailPalette(branding);
  const firstName = request.firstName.trim();
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const intro = request.intro.trim();
  const expires = formatDateTimeInZone(
    request.expiresAt,
    request.timeZone,
    DATE_TIME_WITH_ZONE,
    "en-US",
  );
  const note = `This link is just for you: it opens your answers for ${request.eventName.trim() || "this event"} without signing in, so please don't forward it. You can use it again to change an answer until ${expires}.`;
  const signoff = `— ${request.orgName}`;

  const text = joinTextBlocks([
    greeting,
    intro,
    `Answer the questions: ${request.url}`,
    note,
    signoff,
  ]);

  const html = renderEmailShell({
    orgName: request.orgName,
    siteUrl: request.siteUrl,
    branding,
    bodyHtml: joinHtmlLines([
      copyParagraphHtml(greeting, "margin: 0 0 16px;"),
      copyParagraphHtml(intro, "margin: 0 0 16px;"),
      `  <p style="margin: 0 0 16px;"><a href="${escapeHtml(request.url)}" style="color: ${palette.link}; font-weight: 600; text-decoration: underline;">Answer the questions</a></p>`,
      copyParagraphHtml(
        note,
        `color: ${palette.muted}; font-size: 14px; margin: 0 0 12px;`,
      ),
      copyParagraphHtml(signoff, `color: ${palette.muted}; margin: 12px 0 0;`),
    ]),
  });

  return { subject: request.subject, text, html };
}
