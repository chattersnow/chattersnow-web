import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deliverEmail } from "@/lib/notifications/deliver";
import { tenantMailIdentity, type MailIdentity } from "@/lib/email/identity";
import { isOrgEmailEnabled } from "@/lib/notifications/settings";
import { renderTaskDigest } from "@/lib/notifications/task-digest-email";
import {
  dedupeKeyFor,
  groupForDigest,
  type ActionItemRow,
  type DigestPerson,
  type DigestRecipient,
} from "@/lib/notifications/task-digest";

/**
 * The daily task digest run (#488): read, gate, record, send.
 *
 * Lives here rather than in the route handler so the interesting half can be
 * driven from an integration test with a real database and a fake clock,
 * without going through HTTP or the cron secret. The route is the doorman.
 *
 * Runs on the service-role client, which bypasses RLS. Everything this file
 * does about tenants -- reading the switch per tenant, grouping per tenant,
 * writing tenant_id explicitly -- is therefore load-bearing rather than
 * defensive: there is no policy underneath it to catch a mistake.
 */

export const TASK_DIGEST_KIND = "task_digest";

export type DigestRunSummary = {
  /** Tenants with at least one candidate recipient. */
  tenants: number;
  /** Recipients with qualifying items, before the gates. */
  considered: number;
  sent: number;
  /** Muted by the org switch, opted out, or already recorded for today. */
  skipped: number;
  failed: number;
};

export async function runTaskDigest(
  admin: SupabaseClient,
  options: { now?: Date; siteUrl: string },
): Promise<DigestRunSummary> {
  const now = options.now ?? new Date();
  const dedupeKey = dedupeKeyFor(now);
  const summary: DigestRunSummary = {
    tenants: 0,
    considered: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  const rows = await fetchOpenActionItems(admin);
  if (rows.length === 0) return summary;

  const people = await fetchRecipients(
    admin,
    unique(rows.map((row) => row.owner_person_id)),
  );
  if (people.length === 0) return summary;

  const recipients = groupForDigest(rows, people, now);
  summary.considered = recipients.length;
  if (recipients.length === 0) return summary;

  const meetingDates = await fetchMeetingDates(
    admin,
    unique(recipients.flatMap((r) => r.items.map((item) => item.meetingId))),
  );
  for (const recipient of recipients) {
    for (const item of recipient.items) {
      item.meetingDate = meetingDates.get(item.meetingId) ?? null;
    }
  }

  const optedIn = await fetchOptedIn(
    admin,
    unique(recipients.map((r) => r.personId)),
  );

  // Grouped by tenant so the switch is read once per tenant rather than once
  // per person, and so a muted tenant costs nothing further.
  const byTenant = new Map<string, DigestRecipient[]>();
  for (const recipient of recipients) {
    const list = byTenant.get(recipient.tenantId) ?? [];
    list.push(recipient);
    byTenant.set(recipient.tenantId, list);
  }
  summary.tenants = byTenant.size;

  for (const [tenantId, tenantRecipients] of byTenant) {
    if (!(await isOrgEmailEnabled(admin, tenantId))) {
      summary.skipped += tenantRecipients.length;
      continue;
    }

    // Beside the switch, and after it: one lookup per tenant, and a muted
    // tenant costs nothing further (#857).
    const identity = await tenantMailIdentity(admin, tenantId);

    for (const recipient of tenantRecipients) {
      if (!optedIn.has(preferenceKey(recipient.tenantId, recipient.personId))) {
        summary.skipped += 1;
        continue;
      }
      await deliver(
        admin,
        recipient,
        identity,
        dedupeKey,
        options.siteUrl,
        summary,
      );
    }
  }

  return summary;
}

/**
 * Records the outcome of one recipient's digest against the run summary.
 *
 * The claim-then-send mechanics moved to deliverEmail() when #742 added a
 * second sender; what stays here is the only part that is the digest's own --
 * how an outcome reads in DigestRunSummary.
 */
async function deliver(
  admin: SupabaseClient,
  recipient: DigestRecipient,
  identity: MailIdentity,
  dedupeKey: string,
  siteUrl: string,
  summary: DigestRunSummary,
): Promise<void> {
  const outcome = await deliverEmail(admin, {
    tenantId: recipient.tenantId,
    identity,
    personId: recipient.personId,
    kind: TASK_DIGEST_KIND,
    dedupeKey,
    to: recipient.email,
    render: () => renderTaskDigest(recipient, siteUrl),
    logPrefix: "[task-digest]",
  });

  if (outcome === "sent") summary.sent += 1;
  else if (outcome === "skipped") summary.skipped += 1;
  else summary.failed += 1;
}

async function fetchOpenActionItems(
  admin: SupabaseClient,
): Promise<ActionItemRow[]> {
  const { data, error } = await admin
    .from("governance_meeting_action_items")
    .select("id, tenant_id, description, due_date, owner_person_id, meeting_id")
    .eq("status", "open");

  if (error) {
    console.error("[task-digest] could not read action items", error);
    return [];
  }
  return (data ?? []).map((row) => ({
    ...row,
    meeting_date: null,
  })) as ActionItemRow[];
}

/**
 * Only people who can act on the link. An email address is not enough: the
 * digest links into the portal, so it is meaningless to a donor or sponsor row
 * that has no account, and `people` is full of those.
 */
async function fetchRecipients(
  admin: SupabaseClient,
  personIds: string[],
): Promise<DigestPerson[]> {
  if (personIds.length === 0) return [];

  const { data, error } = await admin
    .from("people")
    .select("id, tenant_id, email, name, preferred_name")
    .in("id", personIds)
    .not("email", "is", null)
    .not("auth_user_id", "is", null);

  if (error) {
    console.error("[task-digest] could not read recipients", error);
    return [];
  }
  return (data ?? []) as DigestPerson[];
}

async function fetchMeetingDates(
  admin: SupabaseClient,
  meetingIds: string[],
): Promise<Map<string, string | null>> {
  const dates = new Map<string, string | null>();
  if (meetingIds.length === 0) return dates;

  const { data, error } = await admin
    .from("governance_meetings")
    .select("id, meeting_date")
    .in("id", meetingIds);

  if (error) {
    console.error("[task-digest] could not read meeting dates", error);
    return dates;
  }
  for (const row of data ?? []) {
    dates.set(row.id as string, (row.meeting_date as string | null) ?? null);
  }
  return dates;
}

/** The set of (tenant, person) pairs that have opted in to this kind. */
async function fetchOptedIn(
  admin: SupabaseClient,
  personIds: string[],
): Promise<Set<string>> {
  const optedIn = new Set<string>();
  if (personIds.length === 0) return optedIn;

  const { data, error } = await admin
    .from("person_notification_preferences")
    .select("tenant_id, person_id")
    .eq("kind", TASK_DIGEST_KIND)
    .eq("enabled", true)
    .in("person_id", personIds);

  // Failing closed: an unreadable preference table means nobody has provably
  // opted in, and sending on a guess is the one mistake with no way back.
  if (error) {
    console.error(
      "[task-digest] could not read notification preferences; sending nothing",
      error,
    );
    return optedIn;
  }
  for (const row of data ?? []) {
    optedIn.add(
      preferenceKey(row.tenant_id as string, row.person_id as string),
    );
  }
  return optedIn;
}

function preferenceKey(tenantId: string, personId: string): string {
  return `${tenantId}:${personId}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
