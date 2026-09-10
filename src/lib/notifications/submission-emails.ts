import { CONTACT_TOPIC_LABELS } from "@/lib/contact-topics";
import type { RenderedEmail } from "@/lib/notifications/rendered-email";

/**
 * The two event-triggered notices (#742), as text and HTML.
 *
 * Same house style as task-digest-email.ts: inline styles, one column, no
 * table scaffolding, and a plain-text part written as prose rather than
 * stripped from the markup.
 *
 * What these deliberately do *not* carry is the submission itself -- no
 * message body, no availability, no phone number. run_retention_purge
 * (20260905120000) hard-deletes contact_messages and volunteer_applications on
 * a schedule, and #488 stores no bodies in notification_deliveries for the
 * same reason: an inbox is somewhere the retention clock cannot reach. The
 * email says who wrote in and what about, and the link goes to the record.
 *
 * No timestamp either: the send is triggered by the insert, so the message's
 * own arrival time is the submission time, and a server-rendered date would
 * have to pick a timezone the recipient never chose.
 */

export type VolunteerApplicationNotice = {
  applicationId: string;
  name: string;
  email: string;
  roleInterest: string | null;
};

export type ContactMessageNotice = {
  messageId: string;
  name: string;
  email: string;
  topic: string;
};

export type ArtworkSubmissionNotice = {
  submissionId: string;
  name: string;
  eventName: string;
  title: string | null;
  imageCount: number;
};

export function volunteerApplicationHref(applicationId: string): string {
  return `/portal/volunteers/applications?application=${encodeURIComponent(applicationId)}`;
}

export function contactMessageHref(messageId: string): string {
  return `/portal/communications?message=${encodeURIComponent(messageId)}`;
}

export function artworkSubmissionHref(submissionId: string): string {
  return `/portal/artwork?submission=${encodeURIComponent(submissionId)}`;
}

export function renderVolunteerApplicationEmail(
  notice: VolunteerApplicationNotice,
  siteUrl: string,
): RenderedEmail {
  const origin = normalizeOrigin(siteUrl);
  const url = `${origin}${volunteerApplicationHref(notice.applicationId)}`;

  const facts: Fact[] = [
    { label: "Name", value: notice.name },
    { label: "Email", value: notice.email },
    { label: "Interested in", value: notice.roleInterest || "Not specified" },
  ];

  return {
    subject: `New volunteer application: ${notice.name}`,
    text: renderText("Someone has applied to volunteer.", facts, {
      linkLabel: "Open the application",
      url,
      accountUrl: `${origin}/portal/account`,
    }),
    html: renderHtml("Someone has applied to volunteer.", facts, {
      linkLabel: "Open the application",
      url,
      accountUrl: `${origin}/portal/account`,
    }),
  };
}

export function renderContactMessageEmail(
  notice: ContactMessageNotice,
  siteUrl: string,
): RenderedEmail {
  const origin = normalizeOrigin(siteUrl);
  const url = `${origin}${contactMessageHref(notice.messageId)}`;
  const topic = CONTACT_TOPIC_LABELS[notice.topic] ?? notice.topic;

  const facts: Fact[] = [
    { label: "From", value: notice.name },
    { label: "Email", value: notice.email },
    { label: "Topic", value: topic },
  ];

  return {
    subject: `New contact message: ${topic}`,
    text: renderText(
      "Someone has written in through the contact form.",
      facts,
      {
        linkLabel: "Read the message",
        url,
        accountUrl: `${origin}/portal/account`,
      },
    ),
    html: renderHtml(
      "Someone has written in through the contact form.",
      facts,
      {
        linkLabel: "Read the message",
        url,
        accountUrl: `${origin}/portal/account`,
      },
    ),
  };
}

/**
 * Deliberately carries no image, not even the thumbnail. The bucket is private
 * and its signed URLs expire within the hour, so an inline preview would be a
 * broken image by the time most people opened the mail -- and embedding the
 * artwork itself would put an artist's unpublished work in an inbox that no
 * retention policy can reach. The link goes to the queue.
 */
export function renderArtworkSubmissionEmail(
  notice: ArtworkSubmissionNotice,
  siteUrl: string,
): RenderedEmail {
  const origin = normalizeOrigin(siteUrl);
  const url = `${origin}${artworkSubmissionHref(notice.submissionId)}`;

  const facts: Fact[] = [
    { label: "Artist", value: notice.name },
    { label: "For", value: notice.eventName },
    { label: "Title", value: notice.title || "Untitled" },
    {
      label: "Images",
      value:
        notice.imageCount === 1 ? "1 image" : `${notice.imageCount} images`,
    },
  ];

  return {
    subject: `New artwork submission: ${notice.title || notice.name}`,
    text: renderText("Someone has submitted artwork.", facts, {
      linkLabel: "Review the submission",
      url,
      accountUrl: `${origin}/portal/account`,
    }),
    html: renderHtml("Someone has submitted artwork.", facts, {
      linkLabel: "Review the submission",
      url,
      accountUrl: `${origin}/portal/account`,
    }),
  };
}

type Fact = { label: string; value: string };

type Link = { linkLabel: string; url: string; accountUrl: string };

/**
 * Trailing slashes come from NEXT_PUBLIC_SITE_URL being typed by hand into an
 * environment variable; the same normalization renderTaskDigest does.
 */
function normalizeOrigin(siteUrl: string): string {
  return siteUrl.replace(/\/+$/, "");
}

function renderText(lead: string, facts: Fact[], link: Link): string {
  const lines = [lead, ""];
  for (const fact of facts) {
    lines.push(`${fact.label}: ${fact.value}`);
  }
  lines.push("", `${link.linkLabel}: ${link.url}`, "");
  lines.push(`Change what you get here: ${link.accountUrl}`);
  return lines.join("\n");
}

function renderHtml(lead: string, facts: Fact[], link: Link): string {
  const rows = facts
    .map(
      (fact) => `    <p style="margin: 0 0 6px;">
      <span style="color: #57534e;">${escapeHtml(fact.label)}:</span> ${escapeHtml(fact.value)}
    </p>`,
    )
    .join("\n");

  return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1c1917; line-height: 1.5; max-width: 560px;">
  <p style="margin: 0 0 16px;">${escapeHtml(lead)}</p>
  <div style="margin: 0 0 20px;">
${rows}
  </div>
  <p style="margin: 0 0 24px;">
    <a href="${escapeHtml(link.url)}" style="color: #4c1d95; font-weight: 600; text-decoration: underline;">${escapeHtml(link.linkLabel)}</a>
  </p>
  <p style="color: #57534e; font-size: 13px; margin: 0;">
    <a href="${escapeHtml(link.accountUrl)}" style="color: #57534e;">Change what you get here</a>
  </p>
</div>`;
}

/**
 * Every value in these messages was typed by an anonymous visitor into a
 * public form, so all of it reaches this file as untrusted text and none of it
 * may close a tag or open an anchor of its own.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
