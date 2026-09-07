import { formatCurrency, formatNumber } from "@/lib/format";
import { formatDateInZone, formatDateTimeInZone } from "@/lib/time";
import { DIGEST_TIME_ZONE } from "@/lib/notifications/task-digest";

/**
 * What goes in the daily leadership ops report, and how it reads (#743).
 *
 * Pure, and separate from the queries that fill it, for the same reasons
 * task-digest.ts is: the rules about what is worth saying are the part most
 * likely to be wrong and the part a database is least convenient to test
 * against, and the job runs on the service-role client -- which RLS does not
 * apply to -- so "one tenant's numbers, and only that tenant's" has to be
 * asserted directly rather than inferred from an integration run.
 *
 * Unlike the task digest this is addressed to an inbox, not a person: the
 * recipients are an app_settings list rather than `people` rows, so there is
 * no name to greet and no per-person preference to consult. The org kill
 * switch still governs it.
 */

/** Same organization, same zone as the task digest. See DIGEST_TIME_ZONE. */
export const OPS_REPORT_TIME_ZONE = DIGEST_TIME_ZONE;

export const OPS_REPORT_KIND = "ops_report";

/**
 * The shared leadership inbox, per tenant, as an app_settings key.
 *
 * Not `person_notification_preferences`: the audience is an address the board
 * agreed on, which routinely is a distribution list with no `people` row
 * behind it and no portal account to link to. Living in app_settings also
 * means the audit-log trigger records who changed it and when, which is the
 * point -- who receives the organization's daily operating picture is a
 * governance question, not a personal preference.
 */
export const OPS_REPORT_RECIPIENTS_SETTING_KEY =
  "notifications.ops_report_recipients";

/** How far ahead an event still counts as "coming up". */
export const UPCOMING_EVENT_WINDOW_DAYS = 7;

/** At most this many events or coverage gaps are listed individually. */
export const MAX_LISTED_ROWS = 8;

/**
 * Borrowed from AttentionSeverity in src/lib/portal/attention-items.ts, and
 * re-declared here rather than imported for the same reason task-digest.ts
 * re-declares its own: that module reaches into route-level queries, and this
 * one has to stay importable by a plain unit test.
 */
export type OpsReportSeverity = "urgent" | "attention" | "info";

export type UpcomingEvent = {
  id: string;
  name: string;
  startsAt: string;
  timezone: string;
};

export type ShiftCoverageGap = {
  shiftId: string;
  eventId: string;
  eventName: string;
  label: string;
  startsAt: string;
  timezone: string;
  assigned: number;
  target: number;
};

/** Everything the report is shaped from, already scoped to one tenant. */
export type OpsReportSource = {
  pendingExpenseApprovals: number;
  pendingReimbursementApprovals: number;
  upcomingEvents: UpcomingEvent[];
  shiftCoverageGaps: ShiftCoverageGap[];
  newContactMessages: number;
  newVolunteerApplications: number;
  inKindDonations: number;
  monetaryDonations: { count: number; total: number };
};

export type OpsReportLine = {
  label: string;
  /** A portal path. The renderer makes it absolute; the shaper has no origin. */
  href: string;
  severity: OpsReportSeverity;
};

export type OpsReportSection = {
  key: string;
  title: string;
  lines: OpsReportLine[];
};

export type OpsReport = {
  tenantId: string;
  /** The calendar day the report covers, "YYYY-MM-DD". */
  day: string;
  /** The instant the previous report went out, and this one counts "new" from. */
  since: Date;
  sections: OpsReportSection[];
  /** Every line across every section, for the subject and the empty check. */
  lineCount: number;
};

/** The calendar date `now` falls on, in the report's zone. */
export function opsReportDay(now: Date): string {
  return formatDateInZone(now, OPS_REPORT_TIME_ZONE);
}

/**
 * `notification_deliveries.dedupe_key` for one recipient on one day.
 *
 * The address is part of the key, where #743 originally proposed a bare
 * `ops-report:YYYY-MM-DD`. Resend takes one recipient per call, so the run
 * sends once per address -- and with a single shared key the first address
 * would claim the day and every other recipient would silently get nothing,
 * for good (a re-run finds the key taken). Per address, adding someone to the
 * list still reaches them today and one refused address cannot mute the rest,
 * while "re-running the job the same day does not re-send" holds exactly as
 * before.
 */
export function opsReportDedupeKey(day: string, email: string): string {
  return `ops-report:${day}:${email}`;
}

/**
 * The configured recipients for a tenant, from whatever is in app_settings.
 *
 * Accepts a JSON array or a single comma/semicolon/whitespace-separated
 * string, because the setting is a text field an administrator types into and
 * both shapes are what people actually write. Anything that is not a plausible
 * address is dropped rather than sent to: a typo in a shared field must not
 * turn into a bounce loop, and the panel validates the same list on the way
 * in, so a bad entry here means the row was edited in the table by hand.
 */
export function parseOpsReportRecipients(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,;\s]+/)
      : [];

  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const address = entry.trim().toLowerCase();
    if (address && isEmailAddress(address)) seen.add(address);
  }
  return [...seen].sort();
}

/**
 * Deliberately loose: this guards against a stray word or a truncated paste,
 * not against an address a mail server would refuse. The provider is the only
 * thing that can really answer that, and its answer is recorded in the ledger.
 */
export function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value);
}

/**
 * The report, or null when there is nothing to say.
 *
 * An all-zeros email every morning is the fastest way to teach a leadership
 * inbox to filter this one, so a quiet day sends nothing -- the same call the
 * task digest makes for a person with no qualifying items.
 */
export function buildOpsReport(
  source: OpsReportSource,
  options: { tenantId: string; now: Date; since: Date },
): OpsReport | null {
  const sections = [
    approvalsSection(source),
    comingUpSection(source),
    newSinceSection(source),
    donationsSection(source),
  ].filter((section): section is OpsReportSection => section !== null);

  const lineCount = sections.reduce(
    (total, section) => total + section.lines.length,
    0,
  );
  if (lineCount === 0) return null;

  return {
    tenantId: options.tenantId,
    day: opsReportDay(options.now),
    since: options.since,
    sections,
    lineCount,
  };
}

function approvalsSection(source: OpsReportSource): OpsReportSection | null {
  const lines: OpsReportLine[] = [];

  if (source.pendingExpenseApprovals > 0) {
    lines.push({
      label: `${plural(source.pendingExpenseApprovals, "expense")} waiting for approval`,
      href: "/portal/finance/expenses?status=submitted",
      severity: "attention",
    });
  }
  if (source.pendingReimbursementApprovals > 0) {
    lines.push({
      label: `${plural(source.pendingReimbursementApprovals, "reimbursement")} waiting for approval`,
      href: "/portal/finance/reimbursements?status=submitted",
      severity: "attention",
    });
  }

  return section("approvals", "Waiting on an approver", lines);
}

/**
 * Coverage gaps come first and read as urgent. An event on the calendar is
 * information; a shift on that event with fewer volunteers than it needs is
 * the thing somebody has to act on while there is still time to act.
 */
function comingUpSection(source: OpsReportSource): OpsReportSection | null {
  const lines: OpsReportLine[] = [];

  for (const gap of source.shiftCoverageGaps.slice(0, MAX_LISTED_ROWS)) {
    lines.push({
      label: `${gap.eventName} — ${gap.label} is ${gap.assigned} of ${gap.target} covered (${startLabel(gap.startsAt, gap.timezone)})`,
      href: `/portal/events/${gap.eventId}?tab=volunteers`,
      severity: "urgent",
    });
  }
  overflow(
    lines,
    source.shiftCoverageGaps.length,
    "coverage gap",
    "/portal/events",
  );

  for (const event of source.upcomingEvents.slice(0, MAX_LISTED_ROWS)) {
    lines.push({
      label: `${event.name} — ${startLabel(event.startsAt, event.timezone)}`,
      href: `/portal/events/${event.id}`,
      severity: "info",
    });
  }
  overflow(lines, source.upcomingEvents.length, "event", "/portal/events");

  return section(
    "coming_up",
    `The next ${UPCOMING_EVENT_WINDOW_DAYS} days`,
    lines,
  );
}

function newSinceSection(source: OpsReportSource): OpsReportSection | null {
  const lines: OpsReportLine[] = [];

  if (source.newContactMessages > 0) {
    lines.push({
      label: plural(source.newContactMessages, "contact message"),
      href: "/portal/communications?status=new",
      severity: "info",
    });
  }
  if (source.newVolunteerApplications > 0) {
    lines.push({
      label: plural(source.newVolunteerApplications, "volunteer application"),
      href: "/portal/volunteers/applications?status=new",
      severity: "info",
    });
  }

  return section("new_since", "New since the last report", lines);
}

function donationsSection(source: OpsReportSource): OpsReportSection | null {
  const lines: OpsReportLine[] = [];

  if (source.monetaryDonations.count > 0) {
    lines.push({
      label: `${plural(source.monetaryDonations.count, "monetary donation")}, ${formatCurrency(source.monetaryDonations.total)} in total`,
      href: "/portal/finance/donations",
      severity: "info",
    });
  }
  if (source.inKindDonations > 0) {
    lines.push({
      label: `${plural(source.inKindDonations, "gear donation")} received`,
      href: "/portal/inventory",
      severity: "info",
    });
  }

  return section("donations", "Donations since the last report", lines);
}

function section(
  key: string,
  title: string,
  lines: OpsReportLine[],
): OpsReportSection | null {
  return lines.length > 0 ? { key, title, lines } : null;
}

/**
 * A tail line when a list was truncated. Without it a report listing eight of
 * thirty coverage gaps reads as a report of eight coverage gaps.
 */
function overflow(
  lines: OpsReportLine[],
  total: number,
  noun: string,
  href: string,
): void {
  const hidden = total - MAX_LISTED_ROWS;
  if (hidden <= 0) return;
  lines.push({
    label: `and ${plural(hidden, `more ${noun}`)}`,
    href,
    severity: "info",
  });
}

/** The event's own zone, not the reader's: "Sat, Mar 14, 9:00 AM MDT". */
function startLabel(startsAt: string, timezone: string): string {
  return formatDateTimeInZone(startsAt, timezone, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function plural(count: number, noun: string): string {
  return `${formatNumber(count)} ${noun}${count === 1 ? "" : "s"}`;
}
