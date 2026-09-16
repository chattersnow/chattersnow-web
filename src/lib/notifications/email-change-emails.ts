import type { RenderedEmail } from "@/lib/notifications/rendered-email";

/**
 * The two messages a record's own address change sends (#1164), as text and
 * HTML.
 *
 * The same pair notification-email-emails.ts sends, and the same house style,
 * but they say a different thing and it matters. That flow redirects where
 * portal mail is delivered; this one changes the address on the person's
 * record -- the one a staffer reads, the one #1162's claim matched, and the
 * one the organization writes to. So the first message says what the address
 * would become rather than what would be forwarded, and the second goes to the
 * address that is being replaced, which is the only place a change nobody
 * asked for can still be caught.
 *
 * Neither carries any of the organization's data, and neither is a
 * notification anybody opted into. The first goes to an address nobody has
 * proved they hold.
 */

export function confirmEmailChangeHref(token: string): string {
  return `/confirm-email-change?token=${encodeURIComponent(token)}`;
}

export function renderEmailChangeConfirmation(notice: {
  /** The organization asking, in its own name, not the platform's. */
  orgName: string;
  /** Who the pending address belongs to, for a message read out of context. */
  personName: string | null;
  token: string;
  expiresAt: Date;
  siteUrl: string;
}): RenderedEmail {
  const url = `${normalizeOrigin(notice.siteUrl)}${confirmEmailChangeHref(notice.token)}`;
  const who = notice.personName?.trim() || "Someone";
  const lead = `${who} asked ${notice.orgName} to use this address on their record.`;
  const expiry = `This link stops working on ${formatExpiry(notice.expiresAt)}.`;
  const ignore =
    "If that was not you, ignore this message and nothing will change.";

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
    html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1c1917; line-height: 1.5; max-width: 560px;">
  <p style="margin: 0 0 16px;">${escapeHtml(lead)}</p>
  <p style="margin: 0 0 24px;">
    <a href="${escapeHtml(url)}" style="color: #4c1d95; font-weight: 600; text-decoration: underline;">Confirm the address</a>
  </p>
  <p style="color: #57534e; font-size: 13px; margin: 0 0 6px;">${escapeHtml(expiry)}</p>
  <p style="color: #57534e; font-size: 13px; margin: 0;">${escapeHtml(ignore)}</p>
</div>`,
  };
}

/**
 * Sent to the address that was on the record until the confirmation landed, so
 * a change nobody asked for leaves a trace somewhere the person still reads.
 */
export function renderEmailChanged(notice: {
  orgName: string;
  confirmedEmail: string;
  siteUrl: string;
}): RenderedEmail {
  const origin = normalizeOrigin(notice.siteUrl);
  const accountUrl = `${origin}/my`;
  const lead = `${notice.orgName} now has ${notice.confirmedEmail} on your record instead of this address.`;
  const undo =
    "If you did not ask for that, tell us straight away — reply to this message or use the contact form on our site.";

  return {
    subject: `Your ${notice.orgName} record has a new email address`,
    text: [lead, "", undo, "", `Your account: ${accountUrl}`].join("\n"),
    html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1c1917; line-height: 1.5; max-width: 560px;">
  <p style="margin: 0 0 16px;">${escapeHtml(lead)}</p>
  <p style="margin: 0 0 24px;">${escapeHtml(undo)}</p>
  <p style="color: #57534e; font-size: 13px; margin: 0;">
    <a href="${escapeHtml(accountUrl)}" style="color: #57534e;">Your account</a>
  </p>
</div>`,
  };
}

/**
 * A date and no clock time, for the reason notification-email-emails.ts gives:
 * the expiry is a day away and the recipient's timezone is not something a
 * server-rendered string can know.
 */
function formatExpiry(expiresAt: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(expiresAt);
}

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
