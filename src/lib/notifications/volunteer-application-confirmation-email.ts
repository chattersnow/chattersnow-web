import type { RenderedEmail } from "@/lib/notifications/rendered-email";

/**
 * The confirmation an applicant gets after applying to volunteer (#1069):
 * their reference code, and where to use it.
 *
 * The code is the whole reason this exists. It is the only key to
 * /get-involved/volunteer/status, and until now the only copy of it was on a
 * page that vanished with the tab. Somebody who lost it could not look their
 * application up and could not re-apply either -- the per-email throttle
 * answers a second attempt with "we already have a recent application from
 * this email" -- so the code in a mailbox is the difference between a status
 * page that works and one that cannot be reached at all.
 *
 * Modelled on gear-request-confirmation-email.ts: addressed to the person the
 * row is about rather than to staff, and carrying no "change what you get"
 * link, because there is no account to change it in.
 *
 * It echoes back neither the availability nor the role interest, and no phone
 * number. submission-emails.ts' header sets out the reason -- run_retention_purge
 * hard-deletes volunteer_applications on a schedule, and an inbox is somewhere
 * that clock cannot reach. The code and the link are what the email is for.
 *
 * The wording stays on "your application" rather than naming a volunteer role,
 * and that is deliberate rather than an oversight: `lexicon.*` lends a tenant
 * the collection and item vocabulary only (src/lib/lexicon.ts), so there is no
 * volunteer term to resolve, and platform code must not assume a tenant calls
 * its people volunteers. "Your application" is true for every tenant without
 * needing a registry entry.
 */

export type VolunteerApplicationConfirmation = {
  orgName: string;
  /** What they typed on the form. Blank is allowed and degrades the greeting. */
  applicantName: string;
  /**
   * The code submit_volunteer_application() minted -- eight characters from an
   * alphabet with no O/0/I/1 (20260827010000), because people read it off a
   * screen and type it into another one. Rendered verbatim; the format is the
   * database's business, not this file's.
   */
  referenceCode: string;
  /** The tenant's own origin, from tenantMailContext(). */
  siteUrl: string;
};

/** Where an applicant looks their own application up. */
export function volunteerStatusHref(): string {
  return "/get-involved/volunteer/status";
}

export function renderVolunteerApplicationConfirmationEmail(
  confirmation: VolunteerApplicationConfirmation,
): RenderedEmail {
  const { orgName, referenceCode } = confirmation;
  const greeting = confirmation.applicantName
    ? `Hi ${confirmation.applicantName},`
    : "Hi,";
  const lead =
    "Thanks for applying. We have your application and we'll be in touch about next steps.";
  const url = `${normalizeOrigin(confirmation.siteUrl)}${volunteerStatusHref()}`;
  const codeLead = "Your reference code is:";
  // Says what to do with it, because the status page asks for the code *and*
  // the address it was sent to, and only one of those is in front of them.
  const codeNote =
    "Keep this email. You'll need that code, and the email address you applied with, to check your application's status.";

  const textLines = [
    greeting,
    "",
    lead,
    "",
    `${codeLead} ${referenceCode}`,
    "",
    codeNote,
    "",
    `Check your status: ${url}`,
    "",
    `— ${orgName}`,
  ];

  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1c1917; line-height: 1.5; max-width: 560px;">
  <p style="margin: 0 0 16px;">${escapeHtml(greeting)}</p>
  <p style="margin: 0 0 16px;">${escapeHtml(lead)}</p>
  <p style="margin: 0 0 4px;">${escapeHtml(codeLead)}</p>
  <p style="margin: 0 0 16px; font-size: 20px; font-weight: 700; letter-spacing: 0.05em;">${escapeHtml(referenceCode)}</p>
  <p style="margin: 0 0 12px;">${escapeHtml(codeNote)}</p>
  <p style="margin: 0 0 12px;"><a href="${escapeHtml(url)}" style="color: #4c1d95; font-weight: 600; text-decoration: underline;">Check your status</a></p>
  <p style="color: #57534e; margin: 12px 0 0;">— ${escapeHtml(orgName)}</p>
</div>`;

  return {
    subject: `Your application — ${orgName}`,
    text: textLines.join("\n"),
    html,
  };
}

/** A trailing slash on a hand-typed origin would otherwise double up. */
function normalizeOrigin(siteUrl: string): string {
  return siteUrl.replace(/\/+$/, "");
}

/**
 * The applicant's name came off a public form and the organization's name out
 * of the tenants table: both are text, neither is markup.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
