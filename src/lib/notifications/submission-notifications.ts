import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deliverEmail,
  type DeliveryOutcome,
} from "@/lib/notifications/deliver";
import { tenantMailContext } from "@/lib/email/identity";
import type { RenderedEmail } from "@/lib/notifications/rendered-email";
import { isOrgEmailEnabled } from "@/lib/notifications/settings";
import { GEAR_REQUEST_CONFIRMATION_KIND } from "@/lib/notifications/kinds";
import { lexiconForTenant } from "@/lib/tenant-lexicon";
import {
  renderArtworkSubmissionEmail,
  renderContactMessageEmail,
  renderGearRequestEmail,
  renderVolunteerApplicationEmail,
} from "@/lib/notifications/submission-emails";
import { renderGearRequestConfirmationEmail } from "@/lib/notifications/gear-request-confirmation-email";
import {
  MEETUP_INSTRUCTIONS_SETTING_KEY,
  PAYMENT_METHODS_SETTING_KEY,
  SHIPPING_INSTRUCTIONS_SETTING_KEY,
  isDeliveryMethod,
  parsePaymentMethods,
} from "@/lib/gear-requests";
import { personDisplayName } from "@/lib/format";

/**
 * The event-triggered sends: a new volunteer application, a new contact
 * message (#742) and a new artwork submission (#870) reach the people who own
 * that queue.
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
export const ARTWORK_SUBMISSION_KIND = "artwork_submission";
export const GEAR_REQUEST_KIND = "gear_request";

/** Who owns the ops inbox. `administration` is the standing fallback. */
const CONTACT_MESSAGE_RESOURCES = ["communications", "administration"];
const VOLUNTEER_APPLICATION_RESOURCES = ["volunteers"];
const ARTWORK_SUBMISSION_RESOURCES = ["artwork_submissions"];
const GEAR_REQUEST_RESOURCES = ["inventory"];

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
    fallbackOrigin: options.siteUrl,
    render: (origin) =>
      renderVolunteerApplicationEmail(
        {
          applicationId: data.id as string,
          name: (data.name as string) ?? "",
          email: (data.email as string) ?? "",
          roleInterest: (data.role_interest as string | null) ?? null,
        },
        origin,
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
  // The topic is one of the strings a tenant renames (#896), and this is
  // the one render path with neither a session nor a host to resolve it
  // from -- it runs after the response, as the service role.
  const lexicon = await lexiconForTenant(admin, data.tenant_id as string);

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
    fallbackOrigin: options.siteUrl,
    render: (origin) =>
      renderContactMessageEmail(
        {
          messageId: data.id as string,
          name: (data.name as string) ?? "",
          email: submitterEmail,
          topic: (data.topic as string) ?? "",
        },
        origin,
        lexicon,
      ),
  });
}

export async function notifyNewArtworkSubmission(
  admin: SupabaseClient,
  options: { submissionId: string; siteUrl: string },
): Promise<NotifySummary> {
  const { data, error } = await admin
    .from("artwork_submissions")
    .select(
      "id, tenant_id, submitter_name, title, events(name), artwork_submission_images(id)",
    )
    .eq("id", options.submissionId)
    .maybeSingle();

  if (error) {
    console.error(
      "[submission-notify] could not read the artwork submission",
      error,
    );
    return { ...NOTHING };
  }
  // Same honeypot reasoning as the two above: submit_artwork() answers a filled
  // honeypot with a gen_random_uuid() for a row it never inserted.
  if (!data) return { ...NOTHING };

  const event = data.events as { name: string } | { name: string }[] | null;
  const eventName = Array.isArray(event)
    ? (event[0]?.name ?? "")
    : (event?.name ?? "");
  const images = (data.artwork_submission_images ?? []) as unknown[];

  return notifyRoleHolders(admin, {
    tenantId: data.tenant_id as string,
    kind: ARTWORK_SUBMISSION_KIND,
    resourceKeys: ARTWORK_SUBMISSION_RESOURCES,
    minLevel: "manage",
    dedupeKey: `${ARTWORK_SUBMISSION_KIND}:${data.id as string}`,
    // No replyTo. A submission is answered from the queue once the piece has
    // been looked at, not by replying to the notice -- the same call the
    // volunteer notice makes.
    fallbackOrigin: options.siteUrl,
    render: (origin) =>
      renderArtworkSubmissionEmail(
        {
          submissionId: data.id as string,
          name: (data.submitter_name as string) ?? "",
          eventName,
          title: (data.title as string | null) ?? null,
          imageCount: images.length,
        },
        origin,
      ),
  });
}

type GearRequestRow = {
  id: string;
  tenant_id: string;
  person_id: string | null;
  delivery_method: string;
  payment_method: string | null;
  requester: {
    name: string | null;
    preferred_name: string | null;
    email: string | null;
  } | null;
};

const GEAR_REQUEST_SELECT =
  "id, tenant_id, person_id, delivery_method, payment_method, requester:people(name, preferred_name, email)";

/**
 * Staff side of a gear request (#1032): the inventory managers hear that
 * someone has asked. Keyed on the request id, which is what
 * request_gear_items() returns -- for a filled honeypot that is a uuid with
 * no row behind it, and this returns nothing, like the three above.
 */
export async function notifyNewGearRequest(
  admin: SupabaseClient,
  options: { requestId: string; siteUrl: string },
): Promise<NotifySummary> {
  const { data, error } = await admin
    .from("gear_requests")
    .select(GEAR_REQUEST_SELECT)
    .eq("id", options.requestId)
    .maybeSingle<GearRequestRow>();

  if (error) {
    console.error("[submission-notify] could not read the gear request", error);
    return { ...NOTHING };
  }
  if (!data) return { ...NOTHING };

  const { count } = await admin
    .from("inventory_movements")
    .select("id", { count: "exact", head: true })
    .eq("gear_request_id", data.id)
    .eq("movement_type", "reserved");

  const lexicon = await lexiconForTenant(admin, data.tenant_id);

  return notifyRoleHolders(admin, {
    tenantId: data.tenant_id,
    kind: GEAR_REQUEST_KIND,
    resourceKeys: GEAR_REQUEST_RESOURCES,
    minLevel: "manage",
    dedupeKey: `${GEAR_REQUEST_KIND}:${data.id}`,
    // No replyTo: a request is answered from its page, where the quote and
    // the handover are recorded -- the same call the volunteer notice makes.
    fallbackOrigin: options.siteUrl,
    render: (origin) =>
      renderGearRequestEmail(
        {
          requestId: data.id,
          name: personDisplayName(data.requester, "Someone"),
          email: data.requester?.email ?? "",
          itemCount: count ?? 0,
          deliveryMethod: data.delivery_method,
        },
        origin,
        lexicon,
      ),
  });
}

/**
 * The requester's own confirmation (#1032). Not a role-holder send: the
 * recipient is the person the request is about, who has no account and no
 * preference row -- so this bypasses the opt-in and goes straight to the
 * ledger, gated only by the tenant's kill switch. deliverEmail() needs a
 * people row, and request_gear_items() always mints one.
 *
 * Reads the tenant's `gear_requests.*` settings here, at send time, rather
 * than storing the instructions on the request: they are the organization's
 * words about what happens next, and the row is about what was asked for.
 */
export async function sendGearRequestConfirmation(
  admin: SupabaseClient,
  options: { requestId: string; siteUrl: string },
): Promise<DeliveryOutcome> {
  const { data, error } = await admin
    .from("gear_requests")
    .select(GEAR_REQUEST_SELECT)
    .eq("id", options.requestId)
    .maybeSingle<GearRequestRow>();

  if (error) {
    console.error(
      "[submission-notify] could not read the gear request for its confirmation",
      error,
    );
    return "failed";
  }
  // Honeypot, or a requester with no address to write to.
  if (!data || !data.person_id || !data.requester?.email) return "skipped";
  if (!isDeliveryMethod(data.delivery_method)) return "skipped";
  const deliveryMethod = data.delivery_method;

  if (!(await isOrgEmailEnabled(admin, data.tenant_id))) return "skipped";

  const [items, settings, tenant, mail] = await Promise.all([
    admin
      .from("inventory_movements")
      .select("inventory_item:inventory_items(description)")
      .eq("gear_request_id", data.id)
      .eq("movement_type", "reserved"),
    admin
      .from("app_settings")
      .select("key, value")
      .eq("tenant_id", data.tenant_id)
      .in("key", [
        PAYMENT_METHODS_SETTING_KEY,
        MEETUP_INSTRUCTIONS_SETTING_KEY,
        SHIPPING_INSTRUCTIONS_SETTING_KEY,
      ]),
    admin.from("tenants").select("name").eq("id", data.tenant_id).maybeSingle(),
    tenantMailContext(admin, data.tenant_id, {
      fallbackOrigin: options.siteUrl,
    }),
  ]);

  const settingsByKey = new Map(
    ((settings.data ?? []) as { key: string; value: unknown }[]).map((row) => [
      row.key,
      row.value,
    ]),
  );
  const instructionsKey =
    deliveryMethod === "shipping"
      ? SHIPPING_INSTRUCTIONS_SETTING_KEY
      : MEETUP_INSTRUCTIONS_SETTING_KEY;
  const instructions = settingsByKey.get(instructionsKey);
  const paymentMethods = parsePaymentMethods(
    settingsByKey.get(PAYMENT_METHODS_SETTING_KEY),
  );

  type ItemRow = {
    inventory_item: { description: string | null } | null;
  };
  const descriptions = ((items.data ?? []) as unknown as ItemRow[])
    .map((row) => row.inventory_item?.description?.trim() ?? "")
    .filter(Boolean);

  const requesterEmail = data.requester.email;
  const requester = data.requester;
  const orgName = ((tenant.data?.name as string | undefined) ?? "").trim();

  return deliverEmail(admin, {
    tenantId: data.tenant_id,
    identity: mail.identity,
    personId: data.person_id,
    kind: GEAR_REQUEST_CONFIRMATION_KIND,
    dedupeKey: `${GEAR_REQUEST_CONFIRMATION_KIND}:${data.id}`,
    to: requesterEmail,
    render: () =>
      renderGearRequestConfirmationEmail({
        orgName: orgName || mail.identity.from,
        requesterName: personDisplayName(requester, ""),
        items: descriptions,
        deliveryMethod,
        instructions: typeof instructions === "string" ? instructions : "",
        paymentMethod:
          deliveryMethod === "shipping"
            ? (paymentMethods.find(
                (method) => method.key === data.payment_method,
              ) ?? null)
            : null,
      }),
    logPrefix: "[gear-request-confirm]",
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
    /**
     * Where this tenant's site lives when it has no domain of its own -- the
     * origin the request came in on. The tenant's own wins where there is one
     * (#860); a thunk taking the origin rather than a closure over it is what
     * lets that be decided here, after the tenant is known.
     */
    fallbackOrigin: string;
    render: (origin: string) => RenderedEmail;
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

  // One tenant per call, so this is once per notice -- and after the gates
  // above, so a tenant with no role holders costs nothing (#857).
  const mail = await tenantMailContext(admin, options.tenantId, {
    fallbackOrigin: options.fallbackOrigin,
  });

  for (const recipient of recipients) {
    if (!optedIn.has(recipient.person_id)) {
      summary.skipped += 1;
      continue;
    }

    const outcome = await deliverEmail(admin, {
      tenantId: options.tenantId,
      identity: mail.identity,
      personId: recipient.person_id,
      kind: options.kind,
      dedupeKey: options.dedupeKey,
      to: recipient.email,
      render: () => options.render(mail.origin),
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
