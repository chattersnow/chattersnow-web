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
import { getRiderProfileMountains } from "@/lib/rider-profile-settings";
import {
  actionError,
  fromGuard,
  fromParseError,
  type ActionFailure,
} from "@/lib/portal/action-result";
import { getRequestOrigin } from "@/lib/request-origin";
import {
  hasOptionAnswer,
  optionCountsError,
  type OptionCountRow,
  type OptionCounts,
} from "@/lib/registration-options";
import { getTenantContext } from "@/lib/portal/tenants";
import { getTenantLegalPublication } from "@/lib/legal-publication";
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

/**
 * Who is bringing the minors in this party, and who to call in an emergency
 * (#685).
 *
 * Gated harder than `rider`, and by a different mechanism. A rider's preferred
 * discipline is chosen in TypeScript — `listEventRegistrantsAction` selects the
 * columns or does not — which any `events: view` holder could go round with a
 * direct PostgREST call. These four are *revoked* from `authenticated` on
 * `event_registrations` itself and served only by the security-definer view
 * `event_registration_minor_contacts`, which does its own `events: manage`
 * check. A guardian's mobile number earns the privilege rather than the
 * convention; see `20260922040000_event_registration_minors.sql`.
 *
 * Null therefore means "not yours to see", and null is also what a party with
 * no minors has — the view returns no row for one. The flag on the registrant
 * is what distinguishes them, and it is readable by everybody who can read the
 * list.
 */
export type RegistrantMinorContacts = {
  accompanying_adult_name: string | null;
  accompanying_adult_phone: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
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
  /**
   * When this person accepted the organization's participant waiver, and which
   * version (#686). Both null means nothing was asked -- no waiver was in
   * force at the time -- and never that they declined: declining is not
   * submitting, so a refusal produces no registrant row to read this off.
   *
   * Like `attended_before`, not gated on `events: manage`. Whether somebody
   * signed the agreement is exactly what the person on the door needs to know
   * before letting them on the hill.
   */
  waiver_accepted_at: string | null;
  waiver_version: number | null;
  /**
   * Whether this party includes anyone under 18 (#685). Null means nobody was
   * asked — a registration taken before the question existed, a walk-in added
   * by staff, a caller of the public API — and must never be read as "no".
   *
   * Not gated on `events: manage`, and that split is the point of the ticket.
   * An organizer working an `events: view` door shift is exactly who has to
   * know before the day; the contacts below are a different matter.
   */
  party_includes_minor: boolean | null;
  /**
   * When the registrant confirmed everyone in their party is 18 or over, on
   * an adults-only event (#1417). Null everywhere else. Not gated on
   * `events: manage`, for the reason `party_includes_minor` is not.
   */
  adults_only_confirmed_at: string | null;
  /**
   * What this person said about being photographed or recorded (#599), and the
   * only three-state field here where every state has to be legible.
   *
   * Null means nobody was asked — this organization had written no
   * `events.photo_consent` scope at the time, or the row came from a walk-in,
   * a staff-added registrant or the public API. **False means they declined**,
   * which is the answer with a job: it is what somebody checks before pointing
   * a camera. `photo_consent_text` is the scope they answered against, kept so
   * a question about it months later can be answered from the row itself.
   *
   * Not gated on `events: manage`, for the same reason as the two fields above
   * and more urgently: the door shift is precisely who needs it, and needs it
   * before the camera comes out. A consent record nobody can see when it
   * matters is the same failure as no record at all.
   */
  photo_consent: boolean | null;
  photo_consent_at: string | null;
  photo_consent_text: string | null;
  /**
   * The answer to the event's registration question (#1407), one row per
   * option chosen. Empty where the event asks none or nobody was asked -- a
   * walk-in staff left unanswered. Not gated on `events: manage`: how many
   * tickets a party needs is what the door hands out.
   */
  option_counts: OptionCountRow[];
  rider: RegistrantRiderProfile | null;
  /** See `RegistrantMinorContacts`. Null unless `events: manage`. */
  minorContacts: RegistrantMinorContacts | null;
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
  /**
   * Whether this organization currently takes a participant waiver (#686).
   *
   * What it buys is the difference between "we never asked" and "we ask, and
   * this row has no answer" -- the second being an older registration taken
   * before the waiver was adopted. Without it every empty cell reads the same,
   * and the same distinction `submission-review-sheet.tsx` makes for artwork
   * consent would be unavailable here.
   */
  waiverInForce: boolean;
  /**
   * Whether this organization currently asks about photos at registration
   * (#599) — that is, whether `events.photo_consent` holds any text.
   *
   * The same thing `waiverInForce` buys above, reinterpreted by #1376: it
   * separates "this organization says nothing about photos" from "there is
   * something to object to here, and this person has not". Read through
   * `tenant_asks_photo_consent()` rather than off `site_content`, because that
   * table needs `site_content: view` and the reader here is a door shift.
   */
  photoConsentInForce: boolean;
  /** The event's registration question (#1407), or null where it asks none. */
  registrationOptions: PortalRegistrationOptions | null;
  /**
   * This organization's preferred-mountain list, for the door-side rider
   * dialog (#1408). Null wherever `rider` is null on every registrant.
   */
  riderMountains: string[] | null;
};

/**
 * An event's registration question as the portal shows it (#1407): each
 * option with its cap and how many registrants have taken it, so the tab can
 * say "7 of 10" before the organizer orders tickets.
 */
export type PortalRegistrationOptions = {
  prompt: string;
  options: { id: string; label: string; cap: number | null; taken: number }[];
};

/**
 * The event's registration question on its own, for the add-registrant and
 * walk-in dialogs. `taken` is filled in by the tab, which has the counts; the
 * dialogs only need the choices.
 */
export async function listEventRegistrationOptionsAction(
  eventId: string,
): Promise<{ data: PortalRegistrationOptions | null } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "events", "view");
  if (permissionError) return permissionError;
  return { data: await loadRegistrationOptions(supabase, eventId, []) };
}

async function loadRegistrationOptions(
  supabase: SupabaseClient,
  eventId: string,
  registrants: EventRegistrant[],
): Promise<PortalRegistrationOptions | null> {
  const [{ data: event }, { data: options }] = await Promise.all([
    supabase
      .from("events")
      .select("registration_options_prompt")
      .eq("id", eventId)
      .maybeSingle(),
    supabase
      .from("event_registration_options")
      .select("id, label, cap")
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true }),
  ]);
  const prompt = event?.registration_options_prompt;
  if (!prompt || !options || options.length === 0) return null;

  const taken = new Map<string, number>();
  for (const registrant of registrants) {
    for (const row of registrant.option_counts) {
      if (!row.option_id) continue;
      taken.set(row.option_id, (taken.get(row.option_id) ?? 0) + row.quantity);
    }
  }

  return {
    prompt,
    options: options.map((option) => ({
      id: option.id,
      label: option.label,
      cap: option.cap,
      taken: taken.get(option.id) ?? 0,
    })),
  };
}

export async function listEventRegistrantsAction(
  eventId: string,
): Promise<{ data: EventRegistrantsData } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "events", "view");
  if (permissionError) return permissionError;

  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "events", "manage");
  // Rider answers need the rider_profiles permission as well, which carries
  // the rider_profile module (#1408) -- so on a tenant without it there is no
  // Rides column, no rider dialog and no rider block in the sheet, for anyone.
  const canSeeRider =
    canManage && hasPermission(permissions, "rider_profiles", "view");

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
  // Read for both readers, including the `events: view` door shift: whether
  // the organization takes a waiver at all is what turns an empty cell from
  // ambiguous into "nobody was asked" (#686).
  const waiverInForce = (await getTenantLegalPublication(supabase)).waiver;
  // Read for both readers too, and for the same reason (#599). A failure lands
  // on "no notice published", which makes the sheet hide the row for
  // registrants with nothing on theirs rather than assert something about a
  // record it could not check -- the quiet direction, and the honest one when
  // the flag itself could not be read. A row carrying an objection still
  // shows, because that condition does not depend on this flag.
  const photoConsentInForce =
    (await supabase.rpc("tenant_asks_photo_consent")).data === true;
  const registrationOptions = await loadRegistrationOptions(
    supabase,
    eventId,
    registrants,
  );

  if (!canManage) {
    return {
      data: {
        registrants,
        messages: NO_RECORD_MESSAGES,
        messaging: null,
        waiverInForce,
        photoConsentInForce,
        registrationOptions,
        riderMountains: null,
      },
    };
  }

  const [
    messages,
    orgEmailEnabled,
    tenantContext,
    orgMail,
    minorContacts,
    riderMountains,
  ] = await Promise.all([
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
    supabase.from("org_notification_settings").select("reply_to").maybeSingle(),
    // The four contacts, through the definer view that is the only way to
    // them: they are revoked from `authenticated` on the table (#685). One
    // read for the event, not one per row, and it returns nothing at all for
    // a reader without `events: manage` — this branch already is one, and
    // the view checks again anyway.
    supabase
      .from("event_registration_minor_contacts")
      .select(
        "registration_id, accompanying_adult_name, accompanying_adult_phone, emergency_contact_name, emergency_contact_phone",
      )
      .eq("event_id", eventId),
    // The door dialog's picker (#1408). Only for a reader who sees rider
    // answers, which is the only reader the dialog opens for.
    canSeeRider ? getRiderProfileMountains(supabase) : Promise.resolve(null),
  ]);

  const contactsById = new Map(
    (minorContacts.data ?? []).map((row) => [
      row.registration_id as string,
      {
        accompanying_adult_name: row.accompanying_adult_name ?? null,
        accompanying_adult_phone: row.accompanying_adult_phone ?? null,
        emergency_contact_name: row.emergency_contact_name ?? null,
        emergency_contact_phone: row.emergency_contact_phone ?? null,
      },
    ]),
  );

  return {
    data: {
      registrants: registrants.map((registrant) => ({
        ...registrant,
        minorContacts: contactsById.get(registrant.id) ?? null,
      })),
      messages,
      messaging: {
        orgName:
          tenantContext.tenants.find(
            (tenant) => tenant.id === tenantContext.currentTenantId,
          )?.name ?? "",
        replyTo: (orgMail.data?.reply_to as string | null) ?? null,
        orgEmailEnabled,
      },
      waiverInForce,
      photoConsentInForce,
      registrationOptions,
      riderMountains,
    },
  };
}

// Every name here also has to appear in 20260922070000's `grant select (...)`
// list: that migration replaced this table's table-level SELECT with a column
// allow-list so the minor contacts could be carved out of it, and a column
// missing from the list simply disappears from the portal.
//
// `option_counts` is an embed, not a column of this table (#1407).
const REGISTRANT_COLUMNS =
  "id, event_id, name, email, phone, pronouns, party_size, notes, created_at, person_id, checked_in_at, attended_before, waiver_accepted_at, waiver_version, party_includes_minor, adults_only_confirmed_at, photo_consent, photo_consent_at, photo_consent_text, option_counts:event_registration_option_counts(option_id, label, quantity, sort_order)";

const RIDER_COLUMNS =
  "riding_discipline_at_event, ski_experience_level_at_event, snowboard_experience_level_at_event, person:people(riding_discipline, ski_experience_level, snowboard_experience_level, preferred_mountain)";

type RegistrantRow = Omit<EventRegistrant, "rider" | "minorContacts"> & {
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
    option_counts,
    ...fields
  } = row as RegistrantRow;
  const rest = { ...fields, option_counts: option_counts ?? [] };

  if (!canSeeRider) return { ...rest, rider: null, minorContacts: null };

  return {
    ...rest,
    // Filled in by the caller from the definer view, which is the only place
    // these four are readable at all.
    minorContacts: null,
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
  // Carries the rider_profile module (#1408); the RPC checks both again.
  const riderError = await checkPermission(
    supabase,
    "rider_profiles",
    "manage",
  );
  if (riderError) return fromGuard("forbidden", riderError);

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
  optionCounts: OptionCounts | null = null,
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
  // #1407. Optional here, but an answer given has to add up.
  const optionsError = hasOptionAnswer(optionCounts)
    ? optionCountsError(optionCounts!, partySize)
    : null;
  if (optionsError) return actionError("invalid_input", optionsError);

  const { data: created, error } = await supabase
    .from("event_registrations")
    .insert({
      event_id: eventId,
      person_id: person.id,
      name: person.name ?? "Registrant",
      email: person.email ?? "",
      phone: person.phone,
      party_size: partySize,
    })
    .select("id")
    .single();

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

  const optionsSaveError = await saveStaffOptionCounts(
    supabase,
    created.id,
    optionCounts,
  );
  if (optionsSaveError) return optionsSaveError;

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
  optionCounts: OptionCounts | null = null,
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
  // #1407. Optional here, but an answer given has to add up.
  const optionsError = hasOptionAnswer(optionCounts)
    ? optionCountsError(optionCounts!, partySize)
    : null;
  if (optionsError) return actionError("invalid_input", optionsError);

  const { data: created, error } = await supabase
    .from("event_registrations")
    .insert({
      event_id: eventId,
      person_id: person.id,
      name: person.name ?? "Walk-in",
      email: person.email ?? "",
      phone: person.phone,
      party_size: partySize,
      checked_in_at: new Date().toISOString(),
    })
    .select("id")
    .single();

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

  const optionsSaveError = await saveStaffOptionCounts(
    supabase,
    created.id,
    optionCounts,
  );
  if (optionsSaveError) return optionsSaveError;

  revalidatePath("/portal/events");
  return { success: true };
}

/**
 * The second write of the two staff paths above (#1407). The registration row
 * is a plain RLS insert and the counts go through a definer function, so the
 * pair is not atomic -- which is why the sum is checked before the insert,
 * leaving only a server fault to land here.
 */
async function saveStaffOptionCounts(
  supabase: SupabaseClient,
  registrationId: string,
  optionCounts: OptionCounts | null,
): Promise<ActionFailure | null> {
  if (!hasOptionAnswer(optionCounts)) return null;
  const { error } = await supabase.rpc("set_registrant_option_counts", {
    p_registration_id: registrationId,
    p_counts: optionCounts!,
  });
  if (!error) return null;
  revalidatePath("/portal/events");
  return actionError(
    "server_error",
    "The registrant was saved, but their options could not be recorded.",
  );
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
