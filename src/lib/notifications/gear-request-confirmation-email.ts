import type { AutoReplyCopy } from "@/lib/notifications/auto-replies";
import {
  autoReplyWords,
  copyParagraphHtml,
  escapeHtml,
  joinHtmlLines,
  joinTextBlocks,
  requireAutoReplyDefinition,
} from "@/lib/notifications/auto-reply-email";
import { GEAR_REQUEST_CONFIRMATION_KIND } from "@/lib/notifications/kinds";
import type { RenderedEmail } from "@/lib/notifications/rendered-email";
import type { DeliveryMethod, PaymentMethod } from "@/lib/gear-requests";

/**
 * The confirmation a requester gets after asking for gear (#1032): what they
 * asked for, how they said they want it, and what happens next in the
 * organization's own words.
 *
 * Unlike the staff notices in submission-emails.ts this one *does* carry the
 * items -- it is the requester's own receipt, sent to the person the data is
 * about, and the list is the whole point of it. It still carries no address:
 * they typed it a minute ago, and a postal address in an email is one more
 * copy outside the retention clock.
 *
 * "These items are now on hold for you and no longer available to others" is a
 * sentence a tenant may need to be different, so the wrapping -- subject,
 * greeting, intro, closing, sign-off -- is theirs to write (#1234), while the
 * item list and the meetup or shipping instructions are rendered here
 * whatever that copy says. The instructions were already the tenant's, out of
 * `app_settings`, and are unchanged by this: a tenant that has written none
 * still gets a generic sentence, so the email never says less than "we got it
 * and we'll be in touch". A tenant that has written no copy either gets the
 * platform's wording, byte for byte what this file sent before the slots
 * existed. No "change what you get" link: there is nothing for a requester to
 * change, and no account to change it in.
 */

const DEFINITION = requireAutoReplyDefinition(GEAR_REQUEST_CONFIRMATION_KIND);

export type GearRequestConfirmation = {
  orgName: string;
  requesterName: string;
  items: string[];
  deliveryMethod: DeliveryMethod;
  /** The tenant's meetup or shipping instructions, whichever applies. */
  instructions: string;
  /** The method the requester chose, resolved to the tenant's entry. Null for a meetup. */
  paymentMethod: PaymentMethod | null;
};

/**
 * @param copy The tenant's resolved slots (resolveAutoReply). Omitted renders
 *   the platform's defaults, which is what a tenant with no row gets.
 */
export function renderGearRequestConfirmationEmail(
  confirmation: GearRequestConfirmation,
  copy?: AutoReplyCopy,
): RenderedEmail {
  const words = autoReplyWords(DEFINITION, copy, {
    org_name: confirmation.orgName,
    first_name: confirmation.requesterName,
  });
  const nextSteps = nextStepsFor(confirmation);

  // The item list sits against the intro with no blank line between them, so
  // the two are one block.
  const asked = [
    words.intro,
    ...confirmation.items.map((item) => `  - ${item}`),
  ]
    .filter(Boolean)
    .join("\n");

  const text = joinTextBlocks([
    words.greeting,
    asked,
    ...nextSteps,
    words.closing,
    words.signoff,
  ]);

  const itemsHtml = confirmation.items
    .map(
      (item) => `      <li style="margin: 0 0 4px;">${escapeHtml(item)}</li>`,
    )
    .join("\n");

  const body = joinHtmlLines([
    copyParagraphHtml(words.greeting, "margin: 0 0 16px;"),
    copyParagraphHtml(words.intro, "margin: 0 0 8px;"),
    `  <ul style="margin: 0 0 20px; padding-left: 20px;">\n${itemsHtml}\n  </ul>`,
    // Always pre-line: the instructions are a settings textarea an
    // administrator may well have put line breaks in.
    ...nextSteps.map(
      (paragraph) =>
        `  <p style="margin: 0 0 12px; white-space: pre-line;">${escapeHtml(paragraph)}</p>`,
    ),
    copyParagraphHtml(words.closing, "margin: 0 0 12px;"),
    copyParagraphHtml(words.signoff, "color: #57534e; margin: 12px 0 0;"),
  ]);

  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1c1917; line-height: 1.5; max-width: 560px;">
${body}
</div>`;

  return { subject: words.subject, text, html };
}

/** The paragraphs after the item list, in order. */
function nextStepsFor(confirmation: GearRequestConfirmation): string[] {
  const steps: string[] = [];
  const instructions = confirmation.instructions.trim();

  if (confirmation.deliveryMethod === "shipping") {
    steps.push(
      "You asked for these to be shipped, with the postage covered by you. We'll pack them, weigh the package and send you the postage amount. Nothing ships until it's paid, so watch for that email.",
    );
    const method = confirmation.paymentMethod;
    if (method) {
      const parts = [`You chose to pay by ${method.label}.`];
      if (method.handle) parts.push(`Send it to: ${method.handle}.`);
      if (method.instructions) parts.push(method.instructions);
      steps.push(parts.join(" "));
    }
  } else {
    steps.push(
      "You asked to pick these up in person. We'll be in touch to arrange a time and place.",
    );
  }

  if (instructions) steps.push(instructions);
  return steps;
}
