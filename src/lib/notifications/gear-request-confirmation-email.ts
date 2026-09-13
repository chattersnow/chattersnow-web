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
 * The instructions are tenant settings, rendered verbatim. A tenant that has
 * written none gets a generic sentence, so the email never says less than
 * "we got it and we'll be in touch". No "change what you get" link either:
 * there is nothing for a requester to change, and no account to change it in.
 */

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

export function renderGearRequestConfirmationEmail(
  confirmation: GearRequestConfirmation,
): RenderedEmail {
  const { orgName } = confirmation;
  const greeting = confirmation.requesterName
    ? `Hi ${confirmation.requesterName},`
    : "Hi,";
  const lead = `Thanks for your request. These items are now on hold for you and no longer available to others:`;
  const nextSteps = nextStepsFor(confirmation);

  const textLines = [
    greeting,
    "",
    lead,
    ...confirmation.items.map((item) => `  - ${item}`),
    "",
    ...nextSteps.map((paragraph) => `${paragraph}\n`),
    `— ${orgName}`,
  ];

  const itemsHtml = confirmation.items
    .map(
      (item) => `      <li style="margin: 0 0 4px;">${escapeHtml(item)}</li>`,
    )
    .join("\n");
  const stepsHtml = nextSteps
    .map(
      (paragraph) =>
        `  <p style="margin: 0 0 12px; white-space: pre-line;">${escapeHtml(paragraph)}</p>`,
    )
    .join("\n");

  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1c1917; line-height: 1.5; max-width: 560px;">
  <p style="margin: 0 0 16px;">${escapeHtml(greeting)}</p>
  <p style="margin: 0 0 8px;">${escapeHtml(lead)}</p>
  <ul style="margin: 0 0 20px; padding-left: 20px;">
${itemsHtml}
  </ul>
${stepsHtml}
  <p style="color: #57534e; margin: 12px 0 0;">— ${escapeHtml(orgName)}</p>
</div>`;

  return {
    subject: `We received your request — ${orgName}`,
    text: textLines.join("\n"),
    html,
  };
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

/**
 * The item descriptions were typed by staff and the instructions by an
 * administrator, but the requester's name came off a public form: all of it
 * is text, none of it markup.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
