import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deliverEmail } from "@/lib/notifications/deliver";
import { tenantMailContext } from "@/lib/email/identity";
import { isOrgEmailEnabled } from "@/lib/notifications/settings";
import { mintConfirmationToken } from "@/lib/notifications/notification-email-token";
import { renderRegistrationAnswersRequestEmail } from "@/lib/notifications/registration-answers-request-email";
import { REGISTRATION_ANSWERS_REQUEST_KIND } from "@/lib/outbound-messages";
import {
  alreadyRegisteredAnswersIntro,
  alreadyRegisteredAnswersSubject,
  CHANGE_ANSWERS_LINK_LABEL,
  registrationAnswersRequestDedupeKey,
} from "@/lib/registration-answer-requests";
import { publicEventAnswersPath } from "@/app/(public)/events/event-path";

/**
 * The registrant's own answers link (#1591): #1502's capability, handed out
 * without anyone asking -- in the confirmation, and by email to somebody who
 * tries to register twice with one address.
 *
 * Both go through service-role-only RPCs, because the caller supplies the
 * token's hash: whoever can choose the hash holds a working link. Here the
 * token is minted on the server and never seen by the caller of the action
 * except as the link itself.
 */

export type IssuedAnswersLink = { token: string; expiresAt: string };

/**
 * Issues a fresh link for a registration, superseding any earlier one. Null
 * where none was issued -- nothing on the page to change (no current
 * questions, and no Instagram requirement, #1647), a cancelled or made-up
 * registration, an event that has ended -- or the write failed, which costs
 * the registrant the link and nothing else.
 */
export async function issueConfirmationAnswersLink(
  admin: SupabaseClient,
  registrationId: string,
): Promise<IssuedAnswersLink | null> {
  const { token, hash } = mintConfirmationToken();
  const { data, error } = await admin.rpc("issue_registration_answer_link", {
    p_registration_id: registrationId,
    p_token_hash: hash,
    p_source: "confirmation",
  });
  if (error) {
    console.error(
      "[registration-answer-link] could not issue a confirmation link",
      error,
    );
    return null;
  }
  return typeof data === "string" ? { token, expiresAt: data } : null;
}

export type AlreadyRegisteredOutcome = "issued" | "none" | "rate_limited";

/**
 * Somebody registering again with an address already registered: issue that
 * registration a link and mail it to the address on the registration, never
 * the screen. Returns once the link is written; the mail goes in `defer`
 * (the action's `after()`), so the response neither waits on the provider nor
 * says by its timing whether a mail went.
 */
export async function issueAlreadyRegisteredAnswersLink(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    eventId: string;
    email: string;
    ipAddress: string | null;
    fallbackOrigin: string;
  },
  defer: (task: () => Promise<void>) => void,
): Promise<AlreadyRegisteredOutcome> {
  const { token, hash } = mintConfirmationToken();
  const { data, error } = await admin.rpc(
    "issue_registration_answer_link_for_email",
    {
      p_tenant_id: input.tenantId,
      p_event_id: input.eventId,
      p_email: input.email,
      p_token_hash: hash,
      p_ip_address: input.ipAddress,
    },
  );
  if (error) {
    if (error.message === "RATE_LIMITED") return "rate_limited";
    console.error(
      "[registration-answer-link] could not issue an already-registered link",
      error,
    );
    return "none";
  }
  const issued = data?.[0];
  if (!issued) return "none";

  defer(async () => {
    try {
      await mailAlreadyRegisteredLink(admin, {
        tenantId: input.tenantId,
        eventId: input.eventId,
        fallbackOrigin: input.fallbackOrigin,
        token,
        tokenHash: hash,
        ...issued,
      });
    } catch (mailError) {
      console.error("[registration-answer-link] the send threw", mailError);
    }
  });
  return "issued";
}

async function mailAlreadyRegisteredLink(
  admin: SupabaseClient,
  link: {
    tenantId: string;
    eventId: string;
    fallbackOrigin: string;
    token: string;
    tokenHash: string;
    registration_id: string;
    name: string;
    email: string;
    person_id: string | null;
    expires_at: string;
  },
): Promise<void> {
  if (!(await isOrgEmailEnabled(admin, link.tenantId))) return;

  const [event, mail] = await Promise.all([
    admin
      .from("events")
      .select("name, timezone")
      .eq("id", link.eventId)
      .eq("tenant_id", link.tenantId)
      .maybeSingle<{ name: string; timezone: string }>(),
    tenantMailContext(admin, link.tenantId, {
      fallbackOrigin: link.fallbackOrigin,
    }),
  ]);
  if (event.error || !event.data) return;

  const origin = mail.origin.replace(/\/+$/, "");
  await deliverEmail(admin, {
    tenantId: link.tenantId,
    personId: link.person_id,
    identity: mail.identity,
    kind: REGISTRATION_ANSWERS_REQUEST_KIND,
    // The hash is unique per issue, so each resend is its own delivery.
    dedupeKey: registrationAnswersRequestDedupeKey(
      link.registration_id,
      link.tokenHash,
    ),
    to: link.email,
    render: () =>
      renderRegistrationAnswersRequestEmail({
        orgName: mail.displayName,
        firstName: link.name.trim().split(/\s+/)[0] ?? "",
        eventName: event.data!.name,
        intro: alreadyRegisteredAnswersIntro(event.data!.name),
        url: `${origin}${publicEventAnswersPath(link.eventId, link.token)}`,
        expiresAt: link.expires_at,
        timeZone: event.data!.timezone,
        siteUrl: mail.origin,
        branding: mail.branding,
        subject: alreadyRegisteredAnswersSubject(event.data!.name),
        linkLabel: CHANGE_ANSWERS_LINK_LABEL,
      }),
    logPrefix: "[registration-answer-link]",
  });
}
