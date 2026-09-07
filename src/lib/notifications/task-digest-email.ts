import { formatCalendarDate } from "@/lib/format";
import type {
  DigestItem,
  DigestRecipient,
} from "@/lib/notifications/task-digest";
import type { RenderedEmail } from "@/lib/notifications/rendered-email";

/**
 * The daily task digest as text and HTML (#488).
 *
 * Short on purpose. This lands in someone's inbox every morning they have
 * something outstanding, so it earns its place by being scannable in two
 * seconds: what is due, when, and a link straight to it. No branding, no
 * preamble, and a plain-text part that is genuinely readable rather than a
 * stripped copy of the markup.
 */

// Re-exported so this module's existing importers keep working; the type moved
// to its own file when #742 gave it a second renderer.
export type { RenderedEmail };

export function renderTaskDigest(
  recipient: DigestRecipient,
  siteUrl: string,
): RenderedEmail {
  const origin = siteUrl.replace(/\/+$/, "");
  const accountUrl = `${origin}/portal/account`;
  const count = recipient.items.length;
  const overdue = recipient.items.filter(
    (item) => item.severity === "urgent",
  ).length;

  return {
    subject: subjectFor(count, overdue),
    text: renderText(recipient, origin, accountUrl),
    html: renderHtml(recipient, origin, accountUrl),
  };
}

/**
 * The count and the overdue count both go in the subject line, because that is
 * often the only part read, and "2 overdue" is the part that changes what
 * someone does next.
 */
function subjectFor(count: number, overdue: number): string {
  const items = `${count} action item${count === 1 ? "" : "s"}`;
  const verb = count === 1 ? "needs" : "need";
  return overdue > 0
    ? `${items} ${verb} your attention (${overdue} overdue)`
    : `${items} ${verb} your attention`;
}

function renderText(
  recipient: DigestRecipient,
  origin: string,
  accountUrl: string,
): string {
  const lines: string[] = [];
  lines.push(greeting(recipient.name));
  lines.push("");
  lines.push("These meeting action items are assigned to you:");
  lines.push("");

  for (const item of recipient.items) {
    lines.push(`* ${item.description}`);
    lines.push(`  ${dueLabel(item)}`);
    lines.push(`  ${origin}${item.href}`);
    lines.push("");
  }

  lines.push(`Change what you get here: ${accountUrl}`);
  return lines.join("\n");
}

function renderHtml(
  recipient: DigestRecipient,
  origin: string,
  accountUrl: string,
): string {
  const items = recipient.items
    .map(
      (item) => `      <li style="margin: 0 0 16px;">
        <a href="${escapeHtml(`${origin}${item.href}`)}" style="color: #4c1d95; font-weight: 600; text-decoration: underline;">${escapeHtml(item.description)}</a>
        <div style="color: ${item.severity === "urgent" ? "#b91c1c" : "#57534e"}; font-size: 14px; margin-top: 2px;">${escapeHtml(dueLabel(item))}</div>
      </li>`,
    )
    .join("\n");

  // Inline styles and a table-free single column: every mail client strips a
  // stylesheet, and half of them still disagree about flexbox.
  return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1c1917; line-height: 1.5; max-width: 560px;">
  <p style="margin: 0 0 16px;">${escapeHtml(greeting(recipient.name))}</p>
  <p style="margin: 0 0 16px;">These meeting action items are assigned to you:</p>
  <ul style="margin: 0 0 24px; padding-left: 20px;">
${items}
  </ul>
  <p style="color: #57534e; font-size: 13px; margin: 0;">
    <a href="${escapeHtml(accountUrl)}" style="color: #57534e;">Change what you get here</a>
  </p>
</div>`;
}

function greeting(name: string | null): string {
  return name ? `Hi ${name},` : "Hi,";
}

/**
 * Reads as a status, not a date field: "Overdue -- was due Mar 14, 2026" says
 * the thing worth saying, where a bare date makes the reader do the comparison.
 */
function dueLabel(item: DigestItem): string {
  if (!item.dueDate) return "No due date";
  const due = formatCalendarDate(item.dueDate);
  return item.severity === "urgent" ? `Overdue — was due ${due}` : `Due ${due}`;
}

/**
 * Action item descriptions are typed by people into the portal, so they reach
 * this file as untrusted text and must not be able to close a tag or open an
 * anchor of their own.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
