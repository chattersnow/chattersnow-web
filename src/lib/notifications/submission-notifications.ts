import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deliverEmail } from "@/lib/notifications/deliver";
import type { RenderedEmail } from "@/lib/notifications/rendered-email";
import { isOrgEmailEnabled } from "@/lib/notifications/settings";
import {
  renderContactMessageEmail,
  renderVolunteerApplicationEmail,
} from "@/lib/notifications/submission-emails";

/**
 * The two event-triggered sends (#742): a new volunteer application and a new
 * contact message reach the people who own that queue.
 *
 * Called from `after()` in the public Server Actions, so nothing here may
 * throw and nothing here may matter to the visitor who submitted the form --
 * their submission is already committed and their response already sent. Every
 * failure is a log line and, where a delivery row exists, a ledger entry.
 *
 * Runs on the service-role client, which bypasses RLS. Every tenant_id below
 * is passed explicitly rather than defaulted, and every recipient is resolved
 * inside one named tenant: there is no policy underneath this to catch a
 * mistake.
 */

export const VOLUNTEER_APPLICATION_KIND = "volunteer_application";
export const CONTACT_MESSAGE_KIND = "contact_message";

/** Who owns the ops inbox. `administration` is the standing fallback. */
const CONTACT_MESSAGE_RESOURCES = ["communications", "administration"];
const VOLUNTEER_APPLICATION_RESOURCES = ["volunteers"];

export type NotifySummary = {
  /** Role holders who could have been mailed, before the gates. */
  considered: number;
  sent: number;
  /** Muted by the org switch, opted out, or already recorded. */
  skipped: number;
  failed: number;
};

const NOTHING: NotifySummary = {
  considered: 0,
  sent: 0,
  skipped: 0,
  failed: 0,
};

/**
 * Keyed on the reference code rather than the row id, because that is all
 * submit_volunteer_application() hands back (20260827010000) -- the same
 * resolution createVolunteerApplication() in test/integration-setup.ts does.
 * The tenant has to come with it: a reference code is unique *within* a
 * tenant, so an unscoped lookup would be a cross-tenant read waiting to
 * happen.
 */
export async function notifyNewVolunteerApplication(
  admin: SupabaseClient,
  options: { tenantId: string; referenceCode: string; siteUrl: string },
): Promise<NotifySummary> {
  const { data, error } = await admin
    .from("volunteer_applications")
    .select("id, tenant_id, name, email, role_interest")
    .eq("tenant_id", options.tenantId)
    .eq("reference_code", options.referenceCode)
    .maybeSingle();

  if (error) {
    console.error(
      "[submission-notify] could not read the volunteer application",
      error,
    );
    return { ...NOTHING };
  }
  // Not an error: submit_volunteer_application() answers a filled honeypot
  // with a freshly generated reference code for a row it never inserted -- and
  // that generator guarantees the code is unused -- so a lookup that finds
  // nothing is a bot, which is ordinary traffic.
  if (!data) return { ...NOTHING };

  return notifyRoleHolders(admin, {
    tenantId: data.tenant_id as string,
    kind: VOLUNTEER_APPLICATION_KIND,
    resourceKeys: VOLUNTEER_APPLICATION_RESOURCES,
    minLevel: "manage",
    dedupeKey: `${VOLUNTEER_APPLICATION_KIND}:${data.id as string}`,
    render: () =>
      renderVolunteerApplicationEmail(
        {
          applicationId: data.id as string,
          name: (data.name as string) ?? "",
          email: (data.email as string) ?? "",
          roleInterest: (data.role_interest as string | null) ?? null,
        },
        options.siteUrl,
      ),
  });
}

export async function notifyNewContactMessage(
  admin: SupabaseClient,
  options: { messageId: string; siteUrl: string },
): Promise<NotifySummary> {
  const { data, error } = await admin
    .from("contact_messages")
    .select("id, tenant_id, name, email, topic")
    .eq("id", options.messageId)
    .maybeSingle();

  if (error) {
    console.error(
      "[submission-notify] could not read the contact message",
      error,
    );
    return { ...NOTHING };
  }
  // Same honeypot reasoning as above: submit_contact_message() returns a
  // gen_random_uuid() for a row it never inserted.
  if (!data) return { ...NOTHING };

  const submitterEmail = (data.email as string) ?? "";

  return notifyRoleHolders(admin, {
    tenantId: data.tenant_id as string,
    kind: CONTACT_MESSAGE_KIND,
    resourceKeys: CONTACT_MESSAGE_RESOURCES,
    minLevel: "manage",
    dedupeKey: `${CONTACT_MESSAGE_KIND}:${data.id as string}`,
    // The organization sends through Resend but reads its mail elsewhere, so
    // without this a staffer hitting reply answers a no-reply address. Pointing
    // it at the person who wrote in makes reply do the obvious thing. The
    // volunteer notice deliberately has no equivalent: an application is
    // answered from the queue, where the reply is recorded.
    replyTo: submitterEmail || undefined,
    render: () =>
      renderContactMessageEmail(
        {
          messageId: data.id as string,
          name: (data.name as string) ?? "",
          email: submitterEmail,
          topic: (data.topic as string) ?? "",
        },
        options.siteUrl,
      ),
  });
}

type Recipient = { person_id: string; email: string };

async function notifyRoleHolders(
  admin: SupabaseClient,
  options: {
    tenantId: string;
    kind: string;
    resourceKeys: string[];
    minLevel: "view" | "manage";
    dedupeKey: string;
    replyTo?: string;
    render: () => RenderedEmail;
  },
): Promise<NotifySummary> {
  const summary: NotifySummary = { ...NOTHING };

  if (!(await isOrgEmailEnabled(admin, options.tenantId))) return summary;

  const recipients = await fetchRoleHolders(admin, options);
  summary.considered = recipients.length;
  if (recipients.length === 0) return summary;

  const optedIn = await fetchOptedIn(
    admin,
    options.tenantId,
    options.kind,
    recipients.map((recipient) => recipient.person_id),
  );

  for (const recipient of recipients) {
    if (!optedIn.has(recipient.person_id)) {
      summary.skipped += 1;
      continue;
    }

    const outcome = await deliverEmail(admin, {
      tenantId: options.tenantId,
      personId: recipient.person_id,
      kind: options.kind,
      dedupeKey: options.dedupeKey,
      to: recipient.email,
      render: options.render,
      replyTo: options.replyTo,
      logPrefix: "[submission-notify]",
    });

    if (outcome === "sent") summary.sent += 1;
    else if (outcome === "skipped") summary.skipped += 1;
    else summary.failed += 1;
  }

  return summary;
}

/**
 * Everyone in this tenant whose portal roles reach the level on any of the
 * resources, already filtered to people with an address and an account.
 *
 * people_with_permission() rather than has_permission(): the latter answers
 * only for auth.uid(), and this caller has no session at all.
 */
async function fetchRoleHolders(
  admin: SupabaseClient,
  options: {
    tenantId: string;
    resourceKeys: string[];
    minLevel: "view" | "manage";
  },
): Promise<Recipient[]> {
  const { data, error } = await admin.rpc("people_with_permission", {
    p_tenant_id: options.tenantId,
    p_resource_keys: options.resourceKeys,
    p_min_level: options.minLevel,
  });

  if (error) {
    console.error(
      "[submission-notify] could not resolve recipients; notifying nobody",
      error,
    );
    return [];
  }
  return (data ?? []) as Recipient[];
}

/** The people who have opted in to this kind, within one tenant. */
async function fetchOptedIn(
  admin: SupabaseClient,
  tenantId: string,
  kind: string,
  personIds: string[],
): Promise<Set<string>> {
  const optedIn = new Set<string>();
  if (personIds.length === 0) return optedIn;

  const { data, error } = await admin
    .from("person_notification_preferences")
    .select("person_id")
    .eq("tenant_id", tenantId)
    .eq("kind", kind)
    .eq("enabled", true)
    .in("person_id", personIds);

  // Failing closed, like the digest's own reader: an unreadable preference
  // table means nobody has provably opted in, and sending on a guess is the
  // one mistake with no way back.
  if (error) {
    console.error(
      "[submission-notify] could not read notification preferences; sending nothing",
      error,
    );
    return optedIn;
  }
  for (const row of data ?? []) {
    optedIn.add(row.person_id as string);
  }
  return optedIn;
}
