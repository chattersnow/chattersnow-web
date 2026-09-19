import type { AutoReplyCopy } from "@/lib/notifications/auto-replies";
import {
  autoReplyWords,
  copyParagraphHtml,
  escapeHtml,
  joinHtmlLines,
  joinTextBlocks,
  requireAutoReplyDefinition,
} from "@/lib/notifications/auto-reply-email";
import { ARTWORK_SUBMISSION_CONFIRMATION_KIND } from "@/lib/notifications/kinds";
import type { RenderedEmail } from "@/lib/notifications/rendered-email";

/**
 * The acknowledgement an artist gets after submitting to an open call
 * (#1237).
 *
 * The same shape, and the same reason for existing, as the contact form's
 * (#870, #742): the review queue heard about the submission and the artist
 * heard nothing, so there was no record in their inbox that a piece they may
 * have spent weeks on had arrived at all.
 *
 * **It echoes back the minimum**: the piece's title, the call it went to, and
 * how many images arrived -- never the images themselves. That is partly the
 * retention rule the top of submission-emails.ts sets out, since
 * `run_retention_purge` reaches the submission and not the mailbox, and partly
 * a plainer point about attachments: the artist has the originals, mailing
 * them their own files back is a slow email for no gain, and the count is what
 * actually answers the question they have, which is "did all three of them get
 * there?".
 *
 * Modelled on volunteer-application-confirmation-email.ts: addressed to the
 * person the row is about rather than to staff, with the wrapping -- subject,
 * greeting, intro, closing, sign-off -- the tenant's to write (#1233) and the
 * detail rows rendered here whatever that copy says. No "change what you get"
 * link, because an artist may hold no account to change it in.
 */

const DEFINITION = requireAutoReplyDefinition(
  ARTWORK_SUBMISSION_CONFIRMATION_KIND,
);

export type ArtworkSubmissionConfirmation = {
  orgName: string;
  /** What they typed on the form. Blank is allowed and degrades the greeting. */
  artistName: string;
  /** `event_artwork_calls.title` -- the call, which may belong to no event (#879). */
  callTitle: string;
  /** The piece's title. Null or blank is allowed: the form does not require one. */
  title: string | null;
  /** How many `artwork_submission_images` rows arrived with it. */
  imageCount: number;
};

/**
 * @param copy The tenant's resolved slots (resolveAutoReply). Omitted renders
 *   the platform's defaults, which is what a tenant with no row gets.
 */
export function renderArtworkSubmissionConfirmationEmail(
  confirmation: ArtworkSubmissionConfirmation,
  copy?: AutoReplyCopy,
): RenderedEmail {
  const words = autoReplyWords(DEFINITION, copy, {
    org_name: confirmation.orgName,
    first_name: confirmation.artistName,
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

/** The labelled lines, in order. */
function detailRows(
  confirmation: ArtworkSubmissionConfirmation,
): [string, string][] {
  const rows: [string, string][] = [];
  const title = confirmation.title?.trim();
  // Left out rather than rendered as "Untitled", the way the event
  // confirmation leaves out a place the event has none of: the form does not
  // ask for a title, and naming the piece something the artist did not call it
  // would be this email putting words in their mouth.
  if (title) rows.push(["Piece", title]);
  const call = confirmation.callTitle.trim();
  if (call) rows.push(["Open call", call]);
  rows.push(["Images", imageCountText(confirmation.imageCount)]);
  return rows;
}

/**
 * The count is the line that answers "did they all get there?", so it is
 * spelled out rather than left as a bare numeral.
 */
function imageCountText(imageCount: number): string {
  return imageCount === 1 ? "1 image" : `${imageCount} images`;
}
