import {
  EMPTY_EMAIL_BRANDING,
  renderEmailShell,
  type EmailBranding,
} from "@/lib/notifications/email-shell";
import type { RenderedEmail } from "@/lib/notifications/rendered-email";

/**
 * A one-off message a staff member wrote to somebody from the portal (#1203).
 *
 * Every other renderer in this directory composes a message out of the
 * organization's own words about a record. This one carries a person's words,
 * which makes it the only renderer whose body is an argument rather than a
 * template, and changes two things.
 *
 * The subject is the staffer's, verbatim. Nothing is prefixed, appended or
 * tidied: they are writing to somebody who asked them for something, and a
 * house prefix on "Re: your beanie" reads as a form letter.
 *
 * The body is plain text typed into a textarea, so it is escaped and its line
 * breaks are honoured with `white-space: pre-line` rather than being turned
 * into markup. Nobody typing into a portal field is writing HTML, and treating
 * what they typed as markup is how a stray `<` eats the rest of a paragraph.
 *
 * No "change what you get" link, for the reason spelled out in
 * `@/lib/outbound-messages`: there is no switch this message obeys. Adding one
 * would promise an opt-out the sender deliberately does not honour.
 */

export type StaffMessage = {
  orgName: string;
  /** What to call the recipient. Blank is allowed and degrades the greeting. */
  recipientName: string;
  /** The staffer's subject line, used as the email's subject unchanged. */
  subject: string;
  /** The staffer's message. Plain text; blank lines are theirs to place. */
  body: string;
  /**
   * The tenant's own origin, from tenantMailContext(). Nothing in this message
   * links anywhere, but the shell needs it: a tenant's logo may be stored as a
   * path this site serves (#1267), and a path is meaningless in an inbox.
   */
  siteUrl?: string;
  /**
   * The tenant's logo and colours (#1238), from the same context. Omitted
   * renders the platform's unbranded shell, which is what a tenant that has
   * set no branding gets anyway.
   */
  branding?: EmailBranding;
};

export function renderStaffMessageEmail(message: StaffMessage): RenderedEmail {
  const greeting = message.recipientName
    ? `Hi ${message.recipientName},`
    : "Hi,";
  const body = message.body.trim();

  const text = [greeting, "", body, "", `— ${message.orgName}`].join("\n");

  const html = renderEmailShell({
    orgName: message.orgName,
    siteUrl: message.siteUrl ?? "",
    branding: message.branding ?? EMPTY_EMAIL_BRANDING,
    bodyHtml: `  <p style="margin: 0 0 16px;">${escapeHtml(greeting)}</p>
  <div style="margin: 0 0 16px; white-space: pre-line;">${escapeHtml(body)}</div>
  <p style="color: #57534e; margin: 12px 0 0;">— ${escapeHtml(message.orgName)}</p>`,
  });

  return { subject: message.subject, text, html };
}

/**
 * The recipient's name came out of the people table, the organization's out of
 * the tenants table, and the body out of a textarea: all three are text, none
 * of them is markup.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
