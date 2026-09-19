import { formatCalendarDate } from "@/lib/format";
import type {
  DigestItem,
  DigestRecipient,
} from "@/lib/notifications/task-digest";
import {
  emailPalette,
  emailShellContext,
  renderEmailShell,
  type EmailOrgBrand,
} from "@/lib/notifications/email-shell";
import type { RenderedEmail } from "@/lib/notifications/rendered-email";

/**
 * The daily task digest as text and HTML (#488).
 *
 * Short on purpose. This lands in someone's inbox every morning they have
 * something outstanding, so it earns its place by being scannable in two
 * seconds: what is due, when, and a link straight to it. No preamble, and a
 * plain-text part that is genuinely readable rather than a stripped copy of
 * the markup.
 *
 * The HTML part sits in the tenant's shell (#1238) -- its logo above, its name
 * below and its accent on the links. The text part is untouched by that and
 * always will be: there is no logo in text/plain.
 */

// Re-exported so this module's existing importers keep working; the type moved
// to its own file when #742 gave it a second renderer.
export type { RenderedEmail };

/**
 * @param brand The tenant's name and branding, from `tenantMailContext()`.
 *   Omitted renders the shell with no header or footer.
 */
export function renderTaskDigest(
  recipient: DigestRecipient,
  siteUrl: string,
  brand?: EmailOrgBrand,
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
    html: renderHtml(recipient, origin, accountUrl, brand),
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
  brand: EmailOrgBrand | undefined,
): string {
  const shell = emailShellContext(brand, origin);
  const palette = emailPalette(shell.branding);
  const items = recipient.items
    .map(
      (item) => `      <li style="margin: 0 0 16px;">
        <a href="${escapeHtml(`${origin}${item.href}`)}" style="color: ${item.severity === "urgent" ? "#b91c1c" : palette.link}; font-weight: 600; text-decoration: underline;">${escapeHtml(item.description)}</a>
        <div style="color: ${item.severity === "urgent" ? "#b91c1c" : palette.muted}; font-size: 14px; margin-top: 2px;">${escapeHtml(dueLabel(item))}</div>
      </li>`,
    )
    .join("\n");

  return renderEmailShell({
    ...shell,
    bodyHtml: `  <p style="margin: 0 0 16px;">${escapeHtml(greeting(recipient.name))}</p>
  <p style="margin: 0 0 16px;">These meeting action items are assigned to you:</p>
  <ul style="margin: 0 0 24px; padding-left: 20px;">
${items}
  </ul>
  <p style="color: ${palette.muted}; font-size: 13px; margin: 0;">
    <a href="${escapeHtml(accountUrl)}" style="color: ${palette.muted};">Change what you get here</a>
  </p>`,
  });
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
