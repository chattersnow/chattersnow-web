import type { RenderedEmail } from "@/lib/notifications/rendered-email";

/**
 * The two messages a claim produces (#1162): one to the people who can review
 * it, and one to the claimant when it is decided.
 *
 * Kept out of `submission-emails.ts` because the claimant-facing half is a
 * different audience with a different rule. Every message in that file is
 * addressed to staff about something a stranger typed. The decision notice
 * below is addressed to the stranger, and it must not repeat anything the
 * claim matched against -- naming the record we linked them to would tell an
 * unsuccessful guesser exactly whose history they nearly received.
 */

export type ClaimNotice = {
  /** The name the claimant typed. Untrusted text, like everything else here. */
  statedName: string;
  statedEmail: string | null;
  statedInstagram: string | null;
  /** How many directory records the matcher proposed, for the lead line. */
  candidateCount: number;
};

function normalizeOrigin(siteUrl: string): string {
  return siteUrl.replace(/\/+$/, "");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function layout(
  lead: string,
  lines: string[],
  link?: { label: string; url: string },
): string {
  const body = lines
    .map(
      (line) =>
        `    <p style="margin: 0 0 6px; color: #57534e;">${escapeHtml(line)}</p>`,
    )
    .join("\n");

  return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1c1917; line-height: 1.5; max-width: 560px;">
  <p style="margin: 0 0 16px;">${escapeHtml(lead)}</p>
${body ? `  <div style="margin: 0 0 20px;">\n${body}\n  </div>` : ""}
${
  link
    ? `  <p style="margin: 0 0 24px;">
    <a href="${escapeHtml(link.url)}" style="color: #4c1d95; font-weight: 600; text-decoration: underline;">${escapeHtml(link.label)}</a>
  </p>`
    : ""
}
</div>`;
}

/** To the people who can review it. */
export function renderClaimReviewEmail(
  notice: ClaimNotice,
  siteUrl: string,
): RenderedEmail {
  const origin = normalizeOrigin(siteUrl);
  const url = `${origin}/portal/people/claims`;
  const lead =
    notice.candidateCount === 0
      ? `${notice.statedName} has asked to be linked to a record, and nothing in the directory resembles what they told us.`
      : notice.candidateCount === 1
        ? `${notice.statedName} has asked to be linked to a record. There is 1 possible match.`
        : `${notice.statedName} has asked to be linked to a record. There are ${notice.candidateCount} possible matches.`;

  const lines = [
    `Name given: ${notice.statedName}`,
    `Email given: ${notice.statedEmail ?? "none"}`,
    `Instagram given: ${notice.statedInstagram ? `@${notice.statedInstagram}` : "none"}`,
  ];

  return {
    subject: `Account claim: ${notice.statedName}`,
    text: [
      lead,
      "",
      ...lines,
      "",
      `Review it: ${url}`,
      "",
      `Change what you get here: ${origin}/portal/account`,
    ].join("\n"),
    html: layout(lead, lines, { label: "Review it", url }),
  };
}

/**
 * To the claimant, once somebody has decided.
 *
 * Says what happened and nothing about how. An approval does not name the
 * record, and a rejection gives no reason: both would be a channel back to
 * somebody who typed a name to see whose history it reached. The organization
 * can write a real explanation by hand; this only makes sure nobody is left
 * waiting, because the form promised they would hear either way.
 */
export function renderClaimDecisionEmail(
  decision: { approved: boolean; organizationName: string },
  siteUrl: string,
): RenderedEmail {
  const origin = normalizeOrigin(siteUrl);
  const url = `${origin}/my`;

  if (decision.approved) {
    const lead = `Your account with ${decision.organizationName} is now linked to your record.`;
    return {
      subject: `You are all set with ${decision.organizationName}`,
      text: [lead, "", `See your account: ${url}`].join("\n"),
      html: layout(lead, [], { label: "See your account", url }),
    };
  }

  const lead = `We could not link your account to a record with ${decision.organizationName} from what you told us.`;
  const lines = [
    "If you think that is wrong, reply to this message and someone will take a look.",
  ];
  return {
    subject: `About your request to ${decision.organizationName}`,
    text: [lead, "", ...lines].join("\n"),
    html: layout(lead, lines),
  };
}
