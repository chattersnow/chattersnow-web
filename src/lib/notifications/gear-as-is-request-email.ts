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

/**
 * A gear requester's own link to acknowledge the as-is terms (#1518), sent by
 * staff for a request made before the public form asked (#1367).
 *
 * The terms themselves are not in the email: the page shows the current
 * wording in the organization's own words, and the acknowledgement records
 * what the page showed. Nothing about the request is repeated either -- no
 * address, no items -- so a forwarded copy gives away as little as the page.
 */

export type GearAsIsRequest = {
  orgName: string;
  /** What to call them. Blank degrades the greeting. */
  firstName: string;
  /** The tenant's word for what it gives away, lower case ("gear"). */
  itemPlural: string;
  /** The absolute link, token included. */
  url: string;
  /** How many days the link works. */
  linkDays: number;
  /** The tenant's own origin, from tenantMailContext(). */
  siteUrl: string;
  branding?: EmailBranding;
  subject: string;
};

export function renderGearAsIsRequestEmail(
  request: GearAsIsRequest,
): RenderedEmail {
  const branding = request.branding ?? EMPTY_EMAIL_BRANDING;
  const palette = emailPalette(branding);
  const firstName = request.firstName.trim();
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const items = request.itemPlural.trim() || "items";
  const intro = `You asked us for ${items} before we started asking everyone to read a short note about how we give things away: exactly as they reach us, with nothing inspected, serviced or certified. Could you take a minute to read it and confirm you understand?`;
  const note = `This link is just for you: it opens your request without signing in, so please don't forward it. It works for ${request.linkDays} days.`;
  const signoff = `— ${request.orgName}`;

  const text = joinTextBlocks([
    greeting,
    intro,
    `Read and confirm: ${request.url}`,
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
      `  <p style="margin: 0 0 16px;"><a href="${escapeHtml(request.url)}" style="color: ${palette.link}; font-weight: 600; text-decoration: underline;">Read and confirm</a></p>`,
      copyParagraphHtml(
        note,
        `color: ${palette.muted}; font-size: 14px; margin: 0 0 12px;`,
      ),
      copyParagraphHtml(signoff, `color: ${palette.muted}; margin: 12px 0 0;`),
    ]),
  });

  return { subject: request.subject, text, html };
}
