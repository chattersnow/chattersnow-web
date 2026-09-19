import { formatDateTimeInZone } from "@/lib/time";
import {
  OPS_REPORT_TIME_ZONE,
  type OpsReport,
  type OpsReportLine,
} from "@/lib/notifications/ops-report";
import {
  emailPalette,
  emailShellContext,
  renderEmailShell,
  type EmailOrgBrand,
  type EmailPalette,
} from "@/lib/notifications/email-shell";
import type { RenderedEmail } from "@/lib/notifications/rendered-email";

/**
 * The daily leadership ops report as text and HTML (#743).
 *
 * Built to the same rules as the task digest's renderer: scannable in a few
 * seconds, no preamble, a plain-text part that reads on its own rather than
 * being the markup with the tags taken out, and an HTML part in the tenant's
 * own shell (#1238). It differs in being sectioned -- the digest is one list of
 * one person's commitments, this is four unrelated queues -- and in having no
 * greeting, because it is addressed to an inbox rather than to anyone in
 * particular.
 */

/**
 * @param brand The tenant's name and branding, from `tenantMailContext()`.
 *   Omitted renders the shell with no header or footer.
 */
export function renderOpsReport(
  report: OpsReport,
  siteUrl: string,
  brand?: EmailOrgBrand,
): RenderedEmail {
  const origin = siteUrl.replace(/\/+$/, "");
  // The tab, not just the page: the recipient list this email is asking
  // about is one of eight panels, and #947 gave each one a URL.
  const settingsUrl = `${origin}/portal/administration/organization-settings?tab=notifications`;

  return {
    subject: subjectFor(report),
    text: renderText(report, origin, settingsUrl),
    html: renderHtml(report, origin, settingsUrl, brand),
  };
}

/**
 * The date and the urgent count. The date is what makes a run of these
 * threadable and searchable; the urgent count is the part that changes what
 * somebody does before opening it.
 */
function subjectFor(report: OpsReport): string {
  const urgent = countUrgent(report);
  const suffix = urgent > 0 ? ` — ${urgent} needing attention` : "";
  return `Daily ops report, ${report.day}${suffix}`;
}

function countUrgent(report: OpsReport): number {
  return report.sections.reduce(
    (total, section) =>
      total + section.lines.filter((line) => line.severity === "urgent").length,
    0,
  );
}

function renderText(
  report: OpsReport,
  origin: string,
  settingsUrl: string,
): string {
  const lines: string[] = [];
  lines.push(coverage(report));
  lines.push("");

  for (const section of report.sections) {
    lines.push(`${section.title.toUpperCase()}`);
    for (const line of section.lines) {
      lines.push(`* ${line.label}`);
      lines.push(`  ${origin}${line.href}`);
    }
    lines.push("");
  }

  lines.push(`Change who receives this: ${settingsUrl}`);
  return lines.join("\n");
}

function renderHtml(
  report: OpsReport,
  origin: string,
  settingsUrl: string,
  brand: EmailOrgBrand | undefined,
): string {
  const shell = emailShellContext(brand, origin);
  const palette = emailPalette(shell.branding);
  const sections = report.sections
    .map(
      (
        section,
      ) => `  <h2 style="color: ${palette.text}; font-size: 15px; margin: 24px 0 8px;">${escapeHtml(section.title)}</h2>
  <ul style="margin: 0; padding-left: 20px;">
${section.lines.map((line) => renderLine(line, origin, palette)).join("\n")}
  </ul>`,
    )
    .join("\n");

  return renderEmailShell({
    ...shell,
    bodyHtml: `  <p style="color: ${palette.muted}; font-size: 13px; margin: 0;">${escapeHtml(coverage(report))}</p>
${sections}
  <p style="color: ${palette.muted}; font-size: 13px; margin: 24px 0 0;">
    <a href="${escapeHtml(settingsUrl)}" style="color: ${palette.muted};">Change who receives this</a>
  </p>`,
  });
}

/**
 * The urgent red is the platform's and stays the platform's: it is a status,
 * not a brand colour, and a tenant whose accent happened to be red would
 * otherwise erase the only distinction this list draws.
 */
function renderLine(
  line: OpsReportLine,
  origin: string,
  palette: EmailPalette,
): string {
  return `    <li style="margin: 0 0 10px; color: ${line.severity === "urgent" ? "#b91c1c" : palette.text};">
      <a href="${escapeHtml(`${origin}${line.href}`)}" style="color: ${line.severity === "urgent" ? "#b91c1c" : palette.link}; font-weight: 600; text-decoration: underline;">${escapeHtml(line.label)}</a>
    </li>`;
}

/**
 * Says what window the "new since" counts are actually counting. Without it a
 * report that skipped a day quietly reads as a report about yesterday.
 */
function coverage(report: OpsReport): string {
  // The organization's zone, not the rendering machine's: this runs on a
  // server that thinks in UTC, and "since 1:00 PM" for a report that went out
  // at 7am reads as a mistake to everyone receiving it.
  const since = formatDateTimeInZone(
    report.since.toISOString(),
    OPS_REPORT_TIME_ZONE,
    {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    },
  );
  return `Covering everything since ${since}.`;
}

/**
 * Event names, shift labels and everything else on a line reach this file as
 * text people typed into the portal, so none of it may close a tag or open an
 * anchor of its own.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
