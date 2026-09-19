import {
  emailPalette,
  EMPTY_EMAIL_BRANDING,
  renderEmailShell,
  type EmailBranding,
} from "@/lib/notifications/email-shell";
import type { RenderedEmail } from "@/lib/notifications/rendered-email";

/**
 * The two messages the address-verification flow sends (#1049), as text and
 * HTML. Same house style as submission-emails.ts: inline styles, one column, no
 * table scaffolding, and a plain-text part written as prose.
 *
 * Neither is a notification anybody opted into, and neither carries any of the
 * organization's data -- which is the point. The first goes to an address
 * nobody has proved they hold, so it says only that somebody asked for it and
 * offers a link; the second goes to the address that was in use until a moment
 * ago, so it can be the thing that catches a change the person did not make.
 */

export function confirmNotificationEmailHref(token: string): string {
  return `/confirm-notification-email?token=${encodeURIComponent(token)}`;
}

export function renderNotificationEmailConfirmation(notice: {
  /** The organization asking, in its own name, not the platform's. */
  orgName: string;
  /** Who the pending address belongs to, for a message read out of context. */
  personName: string | null;
  token: string;
  expiresAt: Date;
  siteUrl: string;
  /**
   * The tenant's logo and colours (#1238), from the same context. Omitted
   * renders the platform's unbranded shell, which is what a tenant that has
   * set no branding gets anyway.
   */
  branding?: EmailBranding;
}): RenderedEmail {
  const branding = notice.branding ?? EMPTY_EMAIL_BRANDING;
  const palette = emailPalette(branding);
  const url = `${normalizeOrigin(notice.siteUrl)}${confirmNotificationEmailHref(notice.token)}`;
  const who = notice.personName?.trim() || "Someone";
  const lead = `${who} asked for ${notice.orgName}'s portal email to be delivered to this address.`;
  const expiry = `This link stops working on ${formatExpiry(notice.expiresAt)}.`;
  // Said plainly, because the person reading it may have no idea what this is:
  // an address can be typed in by an administrator, and a typo lands here too.
  const ignore =
    "If that was not you, ignore this message and nothing will be sent here.";

  return {
    subject: `Confirm this address for ${notice.orgName}`,
    text: [
      lead,
      "",
      `Confirm the address: ${url}`,
      "",
      expiry,
      "",
      ignore,
    ].join("\n"),
    html: renderEmailShell({
      orgName: notice.orgName,
      siteUrl: notice.siteUrl,
      branding,
      bodyHtml: `  <p style="margin: 0 0 16px;">${escapeHtml(lead)}</p>
  <p style="margin: 0 0 24px;">
    <a href="${escapeHtml(url)}" style="color: ${palette.link}; font-weight: 600; text-decoration: underline;">Confirm the address</a>
  </p>
  <p style="color: ${palette.muted}; font-size: 13px; margin: 0 0 6px;">${escapeHtml(expiry)}</p>
  <p style="color: ${palette.muted}; font-size: 13px; margin: 0;">${escapeHtml(ignore)}</p>`,
    }),
  };
}

/**
 * Sent to wherever the mail was going until the confirmation landed, so a
 * redirect nobody asked for leaves a trace somewhere the person still reads.
 */
export function renderNotificationEmailChanged(notice: {
  orgName: string;
  confirmedEmail: string;
  siteUrl: string;
  /**
   * The tenant's logo and colours (#1238), from the same context. Omitted
   * renders the platform's unbranded shell, which is what a tenant that has
   * set no branding gets anyway.
   */
  branding?: EmailBranding;
}): RenderedEmail {
  const branding = notice.branding ?? EMPTY_EMAIL_BRANDING;
  const palette = emailPalette(branding);
  const origin = normalizeOrigin(notice.siteUrl);
  const accountUrl = `${origin}/portal/account`;
  const lead = `${notice.orgName}'s portal email will now be delivered to ${notice.confirmedEmail} instead of this address.`;
  const undo =
    "If you did not ask for that, change it back on your account page and tell an administrator.";

  return {
    subject: `Your ${notice.orgName} email now goes somewhere else`,
    text: [lead, "", undo, "", `Your account: ${accountUrl}`].join("\n"),
    html: renderEmailShell({
      orgName: notice.orgName,
      siteUrl: notice.siteUrl,
      branding,
      bodyHtml: `  <p style="margin: 0 0 16px;">${escapeHtml(lead)}</p>
  <p style="margin: 0 0 24px;">${escapeHtml(undo)}</p>
  <p style="color: ${palette.muted}; font-size: 13px; margin: 0;">
    <a href="${escapeHtml(accountUrl)}" style="color: ${palette.muted};">Your account</a>
  </p>`,
    }),
  };
}

/**
 * A date and no clock time. The expiry is a day away, the recipient's timezone
 * is not something a server-rendered string can know, and "on the 15th" is the
 * only part of it anybody acts on.
 */
function formatExpiry(expiresAt: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(expiresAt);
}

/**
 * Trailing slashes come from NEXT_PUBLIC_SITE_URL being typed by hand into an
 * environment variable; the same normalization the other renderers do.
 */
function normalizeOrigin(siteUrl: string): string {
  return siteUrl.replace(/\/+$/, "");
}

/**
 * The organization's name and the person's are both tenant-supplied text, and
 * the addresses reach here from a form, so none of it may close a tag or open
 * an anchor of its own.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
