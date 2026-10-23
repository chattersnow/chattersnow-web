import {
  CARPOOL_COST_NOTICE_HEADING,
  writtenParagraphs,
} from "@/lib/event-carpools";
import {
  copyParagraphHtml,
  escapeHtml,
  joinHtmlLines,
} from "@/lib/notifications/auto-reply-email";

/**
 * The cost-split notice (#1650) as one email partial, for the registration
 * confirmation and the carpool assignment email (#1651). Notice only, like the
 * component: nothing in either email asks for it to be accepted.
 *
 * Both return nothing for an empty notice -- an event without carpools, or a
 * tenant that blanked the slot -- so a caller can drop either straight into
 * joinTextBlocks() or joinHtmlLines().
 */

export function carpoolCostNoticeText(paragraphs: readonly string[]): string {
  const written = writtenParagraphs(paragraphs);
  if (written.length === 0) return "";
  return [`${CARPOOL_COST_NOTICE_HEADING}:`, ...written].join("\n");
}

export function carpoolCostNoticeHtml(paragraphs: readonly string[]): string {
  const written = writtenParagraphs(paragraphs);
  if (written.length === 0) return "";
  return joinHtmlLines([
    `  <p style="margin: 0 0 8px;"><strong>${escapeHtml(CARPOOL_COST_NOTICE_HEADING)}</strong></p>`,
    ...written.map((paragraph) =>
      copyParagraphHtml(paragraph.trim(), "margin: 0 0 12px;"),
    ),
  ]);
}
