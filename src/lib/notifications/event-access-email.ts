import {
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
 * The email a guest gets when an administrator gives them access to one event
 * (#1689): which event, what they can do there, and where to go. An invite
 * (no account in the organization yet) carries the sign-in link minted for
 * it; an existing account gets a link to the event in the portal.
 *
 * Staff-initiated and not in NOTIFICATION_KINDS, like the carpool assignment:
 * a switch to turn off being told you were given access would only hide it.
 */

export type EventAccessMessage = {
  orgName: string;
  eventName: string;
  level: "view" | "manage";
  /** The labels of the areas the grant covers, in catalog order. */
  areaLabels: readonly string[];
  /** Who gave the access, when known. */
  grantedBy: string | null;
  /**
   * Where the button goes: the invite's sign-in link, or the event in the
   * portal. Absolute.
   */
  url: string;
  invite: boolean;
  siteUrl: string;
  branding?: EmailBranding;
};

export function eventAccessSubject(orgName: string, eventName: string): string {
  return `${orgName} gave you access to ${eventName.trim() || "an event"}`;
}

export function renderEventAccessEmail(
  message: EventAccessMessage,
): RenderedEmail {
  const branding = message.branding ?? EMPTY_EMAIL_BRANDING;
  const palette = emailPalette(branding);
  const eventName = message.eventName.trim() || "an event";
  const by = message.grantedBy?.trim();
  const lead = `${by ? `${by} at ` : ""}${message.orgName} gave you access to ${eventName} in their portal.`;
  const can =
    message.level === "manage"
      ? "You can view and edit:"
      : "You can view (not edit):";
  const linkLabel = message.invite
    ? "Set up your account"
    : `Open ${eventName}`;
  const linkNote = message.invite
    ? "The link signs you in and asks you to choose a password. It works once; after that, sign in at the portal with this address."
    : "Sign in with this address to see it.";
  const scope = `You'll see this event only, until ${message.orgName} removes your access.`;
  const signoff = `— ${message.orgName}`;

  const text = joinTextBlocks([
    lead,
    [can, ...message.areaLabels.map((label) => `  - ${label}`)].join("\n"),
    `${linkLabel}: ${message.url}\n${linkNote}`,
    scope,
    signoff,
  ]);

  const html = renderEmailShell({
    orgName: message.orgName,
    siteUrl: message.siteUrl,
    branding,
    bodyHtml: joinHtmlLines([
      `  <p style="margin: 0 0 16px;">${escapeHtml(lead)}</p>`,
      `  <p style="margin: 0 0 8px;">${escapeHtml(can)}</p>`,
      `  <ul style="margin: 0 0 20px; padding-left: 20px;">`,
      ...message.areaLabels.map(
        (label) =>
          `      <li style="margin: 0 0 4px;">${escapeHtml(label)}</li>`,
      ),
      `  </ul>`,
      `  <p style="margin: 0 0 4px;"><a href="${escapeHtml(message.url)}" style="color: ${palette.link}; font-weight: 600; text-decoration: underline;">${escapeHtml(linkLabel)}</a></p>`,
      `  <p style="color: ${palette.muted}; font-size: 14px; margin: 0 0 20px;">${escapeHtml(linkNote)}</p>`,
      `  <p style="color: ${palette.muted}; font-size: 14px; margin: 0 0 12px;">${escapeHtml(scope)}</p>`,
      `  <p style="color: ${palette.muted}; margin: 12px 0 0;">${escapeHtml(signoff)}</p>`,
    ]),
  });

  return {
    subject: eventAccessSubject(message.orgName, message.eventName),
    text,
    html,
  };
}
