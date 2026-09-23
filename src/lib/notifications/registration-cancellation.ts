import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeliveryOutcome } from "@/lib/notifications/deliver";
import { sendStaffMessage } from "@/lib/notifications/staff-message";
import { EVENT_REGISTRATION_RECORD_TYPE } from "@/lib/outbound-messages";
import { DATE_TIME_WITH_ZONE, formatDateTimeInZone } from "@/lib/time";

/**
 * "Your registration was cancelled" (#1418), to the registrant.
 *
 * Sent through `sendStaffMessage()` rather than a sender of its own, so it
 * lands in the registration's message history in the portal like any other
 * note to this person, and is gated by the same org-wide switch. The words are
 * fixed: a staffer who wants to say more writes to them from the sheet.
 *
 * Runs on the service-role client. The registration is read by its primary
 * key and the event within that registration's tenant, as the confirmation
 * sender does.
 */
export async function sendRegistrationCancellationNotice(
  admin: SupabaseClient,
  options: {
    registrationId: string;
    /** Whoever cancelled it: a staffer, or the registrant themselves. */
    sentBy: string;
    fallbackOrigin: string;
  },
): Promise<DeliveryOutcome> {
  const { data, error } = await admin
    .from("event_registrations")
    .select("id, tenant_id, event_id, person_id, name, email, cancelled_at")
    .eq("id", options.registrationId)
    .maybeSingle();

  if (error) {
    console.error(
      "[registration-cancellation] could not read the registration",
      error,
    );
    return "failed";
  }
  const to = data?.email?.trim() ?? "";
  if (!data || !data.cancelled_at || !to) return "skipped";

  const { data: event, error: eventError } = await admin
    .from("events")
    .select("name, starts_at, timezone")
    .eq("id", data.event_id)
    .eq("tenant_id", data.tenant_id)
    .maybeSingle();

  if (eventError) {
    console.error(
      "[registration-cancellation] could not read the event",
      eventError,
    );
    return "failed";
  }
  if (!event) return "skipped";

  const recipientName = (data.name ?? "").trim();
  return sendStaffMessage(admin, {
    messageId: crypto.randomUUID(),
    tenantId: data.tenant_id,
    personId: data.person_id,
    toEmail: to,
    recipientName,
    module: "events",
    recordType: EVENT_REGISTRATION_RECORD_TYPE,
    recordId: data.id,
    subject: `Your registration for ${event.name} was cancelled`,
    body: registrationCancellationBody(
      event.name,
      formatDateTimeInZone(
        event.starts_at,
        event.timezone,
        DATE_TIME_WITH_ZONE,
        "en-US",
      ),
    ),
    sentBy: options.sentBy,
    fallbackOrigin: options.fallbackOrigin,
  });
}

export function registrationCancellationBody(
  eventName: string,
  when: string,
): string {
  return [
    `Your registration for ${eventName} on ${when} has been cancelled, and your place has been released.`,
    "If you didn't expect this, or you'd like to come after all, reply to this email and we'll sort it out.",
  ].join("\n\n");
}
