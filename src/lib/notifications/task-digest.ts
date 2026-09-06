import { formatDateInZone } from "@/lib/time";

/**
 * Which open action items belong in today's digest, and whose (#488).
 *
 * Pure, and separate from the query that fetches the rows, for two reasons.
 * The window rules ("overdue, or due within a week; undated only on Mondays")
 * are the part most likely to be wrong and are exactly the part a database is
 * least convenient to test against. And the grouping is the only thing keeping
 * one tenant's commitments out of another tenant's inbox -- the job runs on the
 * service-role client, which RLS does not apply to -- so it deserves to be
 * asserted directly rather than inferred from an integration run.
 *
 * Shaped as "row producers in, per-person digest out" so the volunteer-shift
 * and approval-queue sources named in the original ticket fold in later as
 * additional producers into the same per-person email, rather than as a second
 * kind of digest.
 */

/**
 * The organization operates on Mountain time (supabase/seed.sql and the
 * calendar forms both default to it). `due_date` is a `date` column, so what
 * "today" and "in seven days" mean has to be settled in *some* zone; comparing
 * a date against a UTC instant is wrong by a day for several hours each night.
 *
 * A per-tenant timezone setting would be the real answer once a second
 * organization is live in another zone. That is a follow-up, not this ticket.
 */
export const DIGEST_TIME_ZONE = "America/Denver";

/** How far ahead a due date still counts as worth a reminder. */
export const DIGEST_WINDOW_DAYS = 7;

/** A row of governance_meeting_action_items, joined to its meeting. */
export type ActionItemRow = {
  id: string;
  tenant_id: string;
  description: string;
  /** A `date` column: "YYYY-MM-DD", or null for an undated item. */
  due_date: string | null;
  owner_person_id: string;
  meeting_id: string;
  meeting_date: string | null;
};

/** A person who could receive a digest: has an email and a portal account. */
export type DigestPerson = {
  id: string;
  tenant_id: string;
  email: string;
  name: string | null;
  preferred_name: string | null;
};

export type DigestItem = {
  id: string;
  description: string;
  dueDate: string | null;
  meetingId: string;
  meetingDate: string | null;
  /** A portal path. The renderer makes it absolute; the shaper has no origin. */
  href: string;
  /**
   * Borrowed from AttentionSeverity in src/lib/portal/attention-items.ts so the
   * two vocabularies agree, without borrowing its count-aggregate shape -- a
   * digest line is one item, not a tally.
   */
  severity: "urgent" | "attention";
};

export type DigestRecipient = {
  tenantId: string;
  personId: string;
  email: string;
  name: string | null;
  items: DigestItem[];
};

/** The calendar date "now" falls on, in the digest's zone. */
export function digestDay(now: Date): string {
  return formatDateInZone(now, DIGEST_TIME_ZONE);
}

/**
 * Undated items ride along on Mondays only. An open item with no due date can
 * sit in the backlog for months, and including it daily would turn a digest
 * people act on into one they filter -- but dropping it entirely would let it
 * disappear, which is the thing this ticket exists to prevent.
 */
export function includesUndated(now: Date): boolean {
  return (
    new Intl.DateTimeFormat("en-US", {
      timeZone: DIGEST_TIME_ZONE,
      weekday: "short",
    }).format(now) === "Mon"
  );
}

/** `notification_deliveries.dedupe_key` for a given day's run. */
export function dedupeKeyFor(now: Date): string {
  return `task-digest:${digestDay(now)}`;
}

/**
 * Overdue, or due within the window. Undated only when `undated` is allowed.
 * Callers pass `today` rather than a Date so every case is a plain assertion.
 */
export function qualifies(
  row: ActionItemRow,
  today: string,
  undated: boolean,
): boolean {
  if (!row.due_date) return undated;
  return row.due_date <= addCalendarDays(today, DIGEST_WINDOW_DAYS);
}

/**
 * One digest per person per tenant, or none at all.
 *
 * The grouping key carries the tenant, so an email covering two organizations
 * is not a thing this function can produce even if the caller hands it a mixed
 * list. People with nothing qualifying are dropped rather than sent an empty
 * digest, and a row whose owner is not in `people` -- no email, no portal
 * account, or another tenant's person -- has no recipient to attach to and
 * falls away with it.
 */
export function groupForDigest(
  rows: ActionItemRow[],
  people: DigestPerson[],
  now: Date,
): DigestRecipient[] {
  const today = digestDay(now);
  const undated = includesUndated(now);

  const byKey = new Map<string, DigestPerson>();
  for (const person of people) {
    byKey.set(recipientKey(person.tenant_id, person.id), person);
  }

  const recipients = new Map<string, DigestRecipient>();
  for (const row of rows) {
    if (!qualifies(row, today, undated)) continue;

    const key = recipientKey(row.tenant_id, row.owner_person_id);
    const person = byKey.get(key);
    if (!person) continue;

    let recipient = recipients.get(key);
    if (!recipient) {
      recipient = {
        tenantId: person.tenant_id,
        personId: person.id,
        email: person.email,
        name: person.preferred_name ?? person.name,
        items: [],
      };
      recipients.set(key, recipient);
    }
    recipient.items.push(toItem(row, today));
  }

  for (const recipient of recipients.values()) {
    recipient.items.sort(byDueDateThenDescription);
  }

  // Sorted so a run's output, its log line and its tests are all reproducible.
  return [...recipients.values()].sort((a, b) =>
    recipientKey(a.tenantId, a.personId).localeCompare(
      recipientKey(b.tenantId, b.personId),
    ),
  );
}

function toItem(row: ActionItemRow, today: string): DigestItem {
  return {
    id: row.id,
    description: row.description,
    dueDate: row.due_date,
    meetingId: row.meeting_id,
    meetingDate: row.meeting_date,
    // The meeting page renders action items inside the overview tab; the tab is
    // URL state and the section is a DOM id, so both are needed to land on the
    // list rather than at the top of the record.
    href: `/portal/governance/meetings/${row.meeting_id}?tab=overview#action-items-section`,
    severity: row.due_date && row.due_date < today ? "urgent" : "attention",
  };
}

/** Soonest first; undated last, since they have no clock on them. */
function byDueDateThenDescription(a: DigestItem, b: DigestItem): number {
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  return a.description.localeCompare(b.description);
}

function recipientKey(tenantId: string, personId: string): string {
  return `${tenantId}:${personId}`;
}

/**
 * Date arithmetic on the calendar, not the clock: "YYYY-MM-DD" in, the same
 * out, with no zone anywhere near it.
 */
export function addCalendarDays(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + days))
    .toISOString()
    .slice(0, 10);
}
