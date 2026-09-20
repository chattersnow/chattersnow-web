"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  checkPermission,
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import {
  checkInRegistrant,
  undoCheckIn,
  type RegistrantActionResult,
} from "./registrant-core";
import { parseRiderProfileForm } from "@/lib/rider-profile-form";
import {
  actionError,
  fromGuard,
  fromParseError,
} from "@/lib/portal/action-result";
import { getRequestOrigin } from "@/lib/request-origin";
import { getTenantContext } from "@/lib/portal/tenants";
import { getOrgEmailEnabled } from "@/lib/notifications/settings";
import { loadRecordMessages } from "@/lib/portal/record-messages";
import { sendStaffMessage } from "@/lib/notifications/staff-message";
import { recordOutboundMessage } from "@/lib/notifications/outbound-messages";
import { sendEventAnnouncement } from "@/lib/notifications/event-announcement";
import {
  explainSkippedSend,
  RECORD_MESSAGE_ERRORS,
  validateRecordMessage,
} from "@/lib/notifications/record-message";
import {
  eventRegistrationConfirmationDedupeKey,
  sendEventRegistrationConfirmation,
} from "@/lib/notifications/submission-notifications";
import { EVENT_REGISTRATION_CONFIRMATION_KIND } from "@/lib/notifications/kinds";
import {
  EVENT_REGISTRATION_RECORD_TYPE,
  NO_RECORD_MESSAGES,
  resendDedupeSuffix,
  type RecordMessages,
} from "@/lib/outbound-messages";
import {
  ANNOUNCEMENT_ERRORS,
  announcementRefusal,
  isAnnouncementAudience,
  resolveAnnouncementAudience,
  type AnnouncementAudience,
  type AudienceRegistration,
} from "@/lib/event-announcements";
import {
  EVENTS_MODULE,
  REGISTRANT_MESSAGE_ERRORS,
} from "./registrant-messaging";

/**
 * The rider level recorded when this registrant was checked in, alongside the
 * person's current profile (issue #653).
 *
 * `EventRegistrant.rider` is null when the caller may not see rider data, the
 * same "not authorised to see this" shape the nullable fields in
 * `EventImpactDerived` use: get_event_impact_derived_data deliberately gates
 * rider-profile figures, so a read-only events:view holder must not pick them
 * up through the registrants list instead.
 */
export type RegistrantRiderProfile = {
  riding_discipline_at_event: string | null;
  ski_experience_level_at_event: string | null;
  snowboard_experience_level_at_event: string | null;
  riding_discipline: string | null;
  ski_experience_level: string | null;
  snowboard_experience_level: string | null;
  preferred_mountain: string | null;
};

export type EventRegistrant = {
  id: string;
  event_id: string;
  name: string;
  email: string;
  phone: string | null;
  pronouns: string | null;
  party_size: number;
  notes: string | null;
  created_at: string;
  person_id: string | null;
  checked_in_at: string | null;
  /**
   * What this registrant said about having been before (#1259), null when
   * they were not asked or did not answer. Self-reported, and never the source
   * of a first-time figure that leaves this screen -- `EventImpactDerived`
   * stays the only one of those.
   *
   * Not gated on `events: manage` the way `rider` is: it is an answer the
   * person volunteered about their own relationship to the organization, the
   * same class of thing as the name and party size beside it, and the door
   * staff who work an `events: view` shift are exactly who it is for.
   */
  attended_before: boolean | null;
  rider: RegistrantRiderProfile | null;
};

/**
 * What the composer in the registrant sheet needs in order to explain itself
 * (#1317): whose name goes in the default subject, where a reply will land,
 * and whether outbound email is on at all.
 *
 * Null for a reader who does not hold `events: manage` -- door staff working an
 * `events: view` shift see the sheet and none of its messaging half -- which is
 * also what stops the Reply-To and the org name being loaded for somebody who
 * will never see them.
 */
export type RegistrantMessagingContext = {
  orgName: string;
  replyTo: string | null;
  orgEmailEnabled: boolean;
};

/**
 * One read for the whole registrants tab: the rows, what has been said to the
 * people in them, and the context the composer needs.
 *
 * The messages come back with the list rather than through a second action per
 * sheet, for the reason #1204's queues load theirs a page at a time -- a tab
 * renders a sheet per row and somebody opens one of them. RLS answers with
 * nothing at all for a reader without `events: manage`, so the check here only
 * saves the round trip.
 */
export type EventRegistrantsData = {
  registrants: EventRegistrant[];
  messages: RecordMessages;
  messaging: RegistrantMessagingContext | null;
};

export async function listEventRegistrantsAction(
  eventId: string,
): Promise<{ data: EventRegistrantsData } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "events", "view");
  if (permissionError) return permissionError;

  const permissions = await getCurrentUserPermissions(supabase);
  const canSeeRider = hasPermission(permissions, "events", "manage");

  const { data, error } = await supabase
    .from("event_registrations")
    .select(
      canSeeRider
        ? `${REGISTRANT_COLUMNS}, ${RIDER_COLUMNS}`
        : REGISTRANT_COLUMNS,
    )
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (error) {
    return { error: "Could not load registrants. Please try again." };
  }

  const registrants = (data ?? []).map((row) => toRegistrant(row, canSeeRider));
  if (!canSeeRider) {
    return {
      data: { registrants, messages: NO_RECORD_MESSAGES, messaging: null },
    };
  }

  const [messages, orgEmailEnabled, tenantContext, orgMail] = await Promise.all(
    [
      loadRecordMessages(
        supabase,
        EVENT_REGISTRATION_RECORD_TYPE,
        registrants.map((registrant) => registrant.id),
      ),
      getOrgEmailEnabled(supabase),
      // Only for what the composer calls the organization in its default
      // subject. Memoized per request, so the shell has already paid for it.
      getTenantContext(supabase),
      // The Reply-To the composer quotes, through the view that exists because
      // app_settings itself is closed to an events manager.
      supabase
        .from("org_notification_settings")
        .select("reply_to")
        .maybeSingle(),
    ],
  );

  return {
    data: {
      registrants,
      messages,
      messaging: {
        orgName:
          tenantContext.tenants.find(
            (tenant) => tenant.id === tenantContext.currentTenantId,
          )?.name ?? "",
        replyTo: (orgMail.data?.reply_to as string | null) ?? null,
        orgEmailEnabled,
      },
    },
  };
}

const REGISTRANT_COLUMNS =
  "id, event_id, name, email, phone, pronouns, party_size, notes, created_at, person_id, checked_in_at, attended_before";

const RIDER_COLUMNS =
  "riding_discipline_at_event, ski_experience_level_at_event, snowboard_experience_level_at_event, person:people(riding_discipline, ski_experience_level, snowboard_experience_level, preferred_mountain)";

type RegistrantRow = Omit<EventRegistrant, "rider"> & {
  riding_discipline_at_event?: string | null;
  ski_experience_level_at_event?: string | null;
  snowboard_experience_level_at_event?: string | null;
  person?: {
    riding_discipline: string | null;
    ski_experience_level: string | null;
    snowboard_experience_level: string | null;
    preferred_mountain: string | null;
  } | null;
};

function toRegistrant(row: unknown, canSeeRider: boolean): EventRegistrant {
  const {
    person,
    riding_discipline_at_event,
    ski_experience_level_at_event,
    snowboard_experience_level_at_event,
    ...rest
  } = row as RegistrantRow;

  if (!canSeeRider) return { ...rest, rider: null };

  return {
    ...rest,
    rider: {
      riding_discipline_at_event: riding_discipline_at_event ?? null,
      ski_experience_level_at_event: ski_experience_level_at_event ?? null,
      snowboard_experience_level_at_event:
        snowboard_experience_level_at_event ?? null,
      riding_discipline: person?.riding_discipline ?? null,
      ski_experience_level: person?.ski_experience_level ?? null,
      snowboard_experience_level: person?.snowboard_experience_level ?? null,
      preferred_mountain: person?.preferred_mountain ?? null,
    },
  };
}

export type { RegistrantActionResult } from "./registrant-core";

/**
 * Web transport for `checkInRegistrant` (#1082 Phase 1). The decision lives in
 * registrant-core.ts, which has no Next imports.
 */
export async function checkInRegistrantAction(
  id: string,
): Promise<RegistrantActionResult> {
  const supabase = await createSupabaseServerClient();
  const result = await checkInRegistrant(supabase, id);
  if ("error" in result) return result;

  revalidatePath("/portal/events");
  return result;
}

export async function undoCheckInAction(
  id: string,
): Promise<RegistrantActionResult> {
  const supabase = await createSupabaseServerClient();
  const result = await undoCheckIn(supabase, id);
  if ("error" in result) return result;

  revalidatePath("/portal/events");
  return result;
}

// Door-side rider capture (issue #653). The public prompt only reaches people
// who registered after it shipped, and there is no transactional email to chase
// the rest, so check-in is the last moment somebody is actually in front of us.
//
// It goes through set_registrant_rider_profile rather than a direct update
// because the "people update" RLS policy requires people:manage, which an
// event_coordinator - the role that works the door - does not hold.
export async function setRegistrantRiderProfileAction(
  registrationId: string,
  formData: FormData,
): Promise<RegistrantActionResult> {
  const parsed = parseRiderProfileForm(formData);
  if ("error" in parsed) return fromParseError(parsed);

  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to edit a rider profile.",
  );
  if ("error" in userResult) return fromGuard("unauthenticated", userResult);
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return fromGuard("forbidden", permissionError);

  const { error } = await supabase.rpc("set_registrant_rider_profile", {
    p_registration_id: registrationId,
    p_riding_discipline: parsed.data.riding_discipline,
    p_ski_experience_level: parsed.data.ski_experience_level,
    p_snowboard_experience_level: parsed.data.snowboard_experience_level,
    p_preferred_mountain: parsed.data.preferred_mountain,
  });

  if (error) {
    return error.message === "REGISTRANT_NOT_FOUND"
      ? actionError("conflict", "That registration no longer exists.")
      : actionError(
          "server_error",
          "Could not save this rider profile. Please try again.",
        );
  }

  revalidatePath("/portal/events");
  return { success: true };
}

// Registers someone without checking them in - e.g. backfilling a past
// event's RSVP list, or a staff-entered pre-registration - so they show up
// as "registered" but not "attended" until checked in separately. This is
// the same table/RLS path as createWalkInCheckInAction, just without
// setting checked_in_at.
export async function addRegistrantAction(
  eventId: string,
  person: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
  },
  partySize: number,
): Promise<RegistrantActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to add a registrant.",
  );
  if ("error" in userResult) return fromGuard("unauthenticated", userResult);
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return fromGuard("forbidden", permissionError);

  if (!Number.isInteger(partySize) || partySize < 1) {
    return actionError("invalid_input", "Party size must be at least 1.", {
      partySize: "Party size must be at least 1.",
    });
  }

  const { error } = await supabase.from("event_registrations").insert({
    event_id: eventId,
    person_id: person.id,
    name: person.name ?? "Registrant",
    email: person.email ?? "",
    phone: person.phone,
    party_size: partySize,
  });

  if (error) {
    if (error.code === "23505") {
      return actionError(
        "conflict",
        "This person already has a registration for this event.",
      );
    }
    return actionError(
      "server_error",
      "Could not add this registrant. Please try again.",
    );
  }

  revalidatePath("/portal/events");
  return { success: true };
}

export async function createWalkInCheckInAction(
  eventId: string,
  person: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
  },
  partySize: number,
): Promise<RegistrantActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to check in a walk-in.",
  );
  if ("error" in userResult) return fromGuard("unauthenticated", userResult);
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return fromGuard("forbidden", permissionError);

  if (!Number.isInteger(partySize) || partySize < 1) {
    return actionError("invalid_input", "Party size must be at least 1.", {
      partySize: "Party size must be at least 1.",
    });
  }

  const { error } = await supabase.from("event_registrations").insert({
    event_id: eventId,
    person_id: person.id,
    name: person.name ?? "Walk-in",
    email: person.email ?? "",
    phone: person.phone,
    party_size: partySize,
    checked_in_at: new Date().toISOString(),
  });

  if (error) {
    if (error.code === "23505") {
      return actionError(
        "conflict",
        "This person already has a registration for this event. Check them in from the existing row instead.",
      );
    }
    return actionError(
      "server_error",
      "Could not check in this walk-in. Please try again.",
    );
  }

  revalidatePath("/portal/events");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Messaging registrants (#1317, on #1203's primitive)
// ---------------------------------------------------------------------------

const EVENTS_PATH = "/portal/events";

export type RegistrantMessageResult = { error: string } | { success: true };

/**
 * The guard the messaging actions open with. It hands back the user as well as
 * the client because every one of them needs the actor's id: the history row's
 * insert runs on the service-role client, where auth.uid() is null and
 * `sent_by` is therefore the only record of who sent the message.
 *
 * `events: manage`, not `view`. Door staff work a shift on `events: view` and
 * have to be able to read the registrant list; writing to the people on it, on
 * the organization's own letterhead, is a different thing.
 */
async function requireEventsManage(): Promise<
  { supabase: SupabaseClient; user: User } | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    REGISTRANT_MESSAGE_ERRORS.SIGNED_OUT,
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    EVENTS_MODULE,
    "manage",
  );
  if (permissionError) return permissionError;
  return { supabase, user: userResult.user };
}

type RegistrationRow = {
  id: string;
  tenant_id: string;
  event_id: string;
  name: string | null;
  email: string | null;
  person_id: string | null;
};

const REGISTRATION_MESSAGE_SELECT =
  "id, tenant_id, event_id, name, email, person_id";

/**
 * Write to one registrant, about the event they registered for.
 *
 * The question about parking, the note that the start time moved, the answer
 * about a party size: until now every one of those happened in somebody's
 * personal mailbox and the event kept no record of any of it. This is that
 * correspondence, kept with the registration.
 *
 * The recipient is resolved here from the registration, never taken from the
 * client, for the reason #1203 gives: an action that accepted an address would
 * be a relay that mails anyone at all behind `events: manage`. The read runs
 * under the caller's own session, so a registration in another tenant is not
 * found rather than being written to.
 *
 * `personId` may be null and that is not a fault -- sendStaffMessage() has
 * taken it nullable since #1204's contact messages -- so an unlinked
 * registration can still be answered.
 */
export async function sendEventRegistrantMessageAction(input: {
  messageId: string;
  registrationId: string;
  subject: string;
  body: string;
}): Promise<RegistrantMessageResult> {
  const guard = await requireEventsManage();
  if ("error" in guard) return guard;

  const validated = validateRecordMessage(input);
  if ("error" in validated) return validated;
  const { subject, body } = validated;

  const { data, error } = await guard.supabase
    .from("event_registrations")
    .select(REGISTRATION_MESSAGE_SELECT)
    .eq("id", input.registrationId)
    .maybeSingle<RegistrationRow>();

  if (error) return { error: RECORD_MESSAGE_ERRORS.FAILED };
  if (!data) return { error: REGISTRANT_MESSAGE_ERRORS.NOT_FOUND };
  const toEmail = data.email?.trim();
  if (!toEmail) return { error: REGISTRANT_MESSAGE_ERRORS.NO_EMAIL };

  const outcome = await sendStaffMessage(createSupabaseAdminClient(), {
    messageId: input.messageId,
    tenantId: data.tenant_id,
    personId: data.person_id,
    toEmail,
    recipientName: (data.name ?? "").trim(),
    module: EVENTS_MODULE,
    recordType: EVENT_REGISTRATION_RECORD_TYPE,
    recordId: input.registrationId,
    subject,
    body,
    sentBy: guard.user.id,
    fallbackOrigin: await getRequestOrigin(),
  });

  if (outcome === "skipped") {
    return { error: await explainSkippedSend(guard.supabase) };
  }
  if (outcome === "failed") return { error: RECORD_MESSAGE_ERRORS.FAILED };

  revalidatePath(EVENTS_PATH);
  return { success: true };
}

/**
 * Send the registrant's own confirmation (#1068) again.
 *
 * The case this answers is the ordinary one: somebody says they never got
 * their confirmation, and there is no way from the portal to tell whether it
 * went, let alone to send it again. It re-renders through the original sender
 * rather than a copy, so a resent confirmation carries the same details -- and
 * the same calendar attachment -- as a fresh one.
 */
export async function resendEventRegistrationConfirmationAction(
  registrationId: string,
): Promise<RegistrantMessageResult> {
  const guard = await requireEventsManage();
  if ("error" in guard) return guard;

  const { data, error } = await guard.supabase
    .from("event_registrations")
    .select(REGISTRATION_MESSAGE_SELECT)
    .eq("id", registrationId)
    .maybeSingle<RegistrationRow>();

  if (error) return { error: RECORD_MESSAGE_ERRORS.FAILED };
  if (!data) return { error: REGISTRANT_MESSAGE_ERRORS.NOT_FOUND };
  // The sender answers `skipped` for both of these, which would read to the
  // organizer as "already sent". Say what is actually wrong instead.
  const toEmail = data.email?.trim();
  if (!toEmail) return { error: REGISTRANT_MESSAGE_ERRORS.NO_EMAIL };
  if (!data.person_id) return { error: REGISTRANT_MESSAGE_ERRORS.NO_PERSON };

  const admin = createSupabaseAdminClient();
  const dedupeSuffix = resendDedupeSuffix();
  // An object rather than a `let`: TypeScript narrows a variable a callback
  // assigns to its initial type, and this is only ever read afterwards.
  const sent: { subject?: string } = {};

  const outcome = await sendEventRegistrationConfirmation(admin, {
    registrationId,
    siteUrl: await getRequestOrigin(),
    dedupeSuffix,
    onRendered: (email) => {
      sent.subject = email.subject;
    },
  });

  if (outcome === "skipped") {
    return {
      error: await explainSkippedSend(
        guard.supabase,
        REGISTRANT_MESSAGE_ERRORS.RESENT_RECENTLY,
      ),
    };
  }
  if (outcome === "failed") {
    return { error: REGISTRANT_MESSAGE_ERRORS.RESEND_FAILED };
  }

  // The resend joins the history like any other send, so the sheet explains a
  // second copy the registrant may ask about. The body is empty on purpose:
  // the organization wrote this one, and the renderer is where it lives.
  await recordOutboundMessage(admin, {
    messageId: crypto.randomUUID(),
    tenantId: data.tenant_id,
    personId: data.person_id,
    toEmail,
    module: EVENTS_MODULE,
    recordType: EVENT_REGISTRATION_RECORD_TYPE,
    recordId: registrationId,
    subject: sent.subject ?? "Your registration",
    body: "",
    kind: EVENT_REGISTRATION_CONFIRMATION_KIND,
    dedupeKey: eventRegistrationConfirmationDedupeKey(
      registrationId,
      dedupeSuffix,
    ),
    status: outcome,
    sentBy: guard.user.id,
  });

  revalidatePath(EVENTS_PATH);
  return { success: true };
}

export type EventAnnouncementResult =
  { error: string } | { success: true; recipients: number };

/**
 * Tell everybody registered for this event something.
 *
 * Everything that decides the send happens before the response: the audience
 * is resolved here, under the caller's own session, so the count the organizer
 * was shown is the count that is mailed, and both the cap and the org-wide
 * kill switch refuse *in front of them* rather than silently in a background
 * task. Only the sending itself is deferred, because fifty spaced sends is
 * the better part of a minute of provider round trips and nobody should watch
 * a spinner for it -- the announcements card is where the outcome is read.
 *
 * The audience is re-resolved here rather than trusted from the browser for
 * the same reason the one-to-one composer takes no address: an action that
 * accepted a recipient list would be a relay that mails anyone at all behind
 * `events: manage`.
 */
export async function sendEventAnnouncementAction(input: {
  /** Minted by the composer; shared by every copy, and half of each dedupe key. */
  batchId: string;
  eventId: string;
  audience: AnnouncementAudience;
  subject: string;
  body: string;
}): Promise<EventAnnouncementResult> {
  const guard = await requireEventsManage();
  if ("error" in guard) return guard;

  const validated = validateRecordMessage({
    messageId: input.batchId,
    subject: input.subject,
    body: input.body,
  });
  if ("error" in validated) return validated;
  const { subject, body } = validated;

  if (!isAnnouncementAudience(input.audience)) {
    return { error: ANNOUNCEMENT_ERRORS.AUDIENCE_INVALID };
  }

  const [event, registrations] = await Promise.all([
    guard.supabase
      .from("events")
      .select("id, name, tenant_id")
      .eq("id", input.eventId)
      .maybeSingle<{ id: string; name: string; tenant_id: string }>(),
    guard.supabase
      .from("event_registrations")
      .select("id, name, email, person_id, checked_in_at")
      .eq("event_id", input.eventId)
      .order("created_at", { ascending: true }),
  ]);

  if (event.error || registrations.error) {
    return { error: RECORD_MESSAGE_ERRORS.FAILED };
  }
  if (!event.data) return { error: REGISTRANT_MESSAGE_ERRORS.EVENT_NOT_FOUND };

  const resolved = resolveAnnouncementAudience(
    (registrations.data ?? []) as AudienceRegistration[],
    input.audience,
  );
  const refusal = announcementRefusal(resolved);
  if (refusal) return { error: refusal };

  // Refused in front of the organizer rather than discovered by the sender
  // after the response: "nothing was sent, and here is why" is only useful
  // while somebody is still looking at the composer.
  if (!(await getOrgEmailEnabled(guard.supabase))) {
    return { error: RECORD_MESSAGE_ERRORS.EMAIL_OFF };
  }

  // Read before after(), which runs once the response is on its way and may no
  // longer have the request's headers to resolve an origin from.
  const fallbackOrigin = await getRequestOrigin();
  const admin = createSupabaseAdminClient();
  const request = {
    tenantId: event.data.tenant_id,
    eventId: event.data.id,
    eventName: event.data.name,
    batchId: input.batchId,
    subject,
    body,
    recipients: resolved.recipients,
    sentBy: guard.user.id,
    fallbackOrigin,
  };

  after(async () => {
    try {
      await sendEventAnnouncement(admin, request);
    } catch (error) {
      // Nothing left to tell: the response has gone. Each recipient's own
      // outcome is in the ledger and the history card either way.
      console.error("[event-announcement] the batch threw", error);
    }
  });

  return { success: true, recipients: resolved.recipients.length };
}
