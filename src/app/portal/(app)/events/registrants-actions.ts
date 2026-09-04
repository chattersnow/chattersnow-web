"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  checkPermission,
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import { parseRiderProfileForm } from "@/lib/rider-profile-form";

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
  party_size: number;
  notes: string | null;
  created_at: string;
  person_id: string | null;
  checked_in_at: string | null;
  rider: RegistrantRiderProfile | null;
};

export async function listEventRegistrantsAction(
  eventId: string,
): Promise<{ data: EventRegistrant[] } | { error: string }> {
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
  return { data: (data ?? []).map((row) => toRegistrant(row, canSeeRider)) };
}

const REGISTRANT_COLUMNS =
  "id, event_id, name, email, phone, party_size, notes, created_at, person_id, checked_in_at";

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

export type RegistrantActionResult = { error: string } | { success: true };

export async function checkInRegistrantAction(
  id: string,
): Promise<RegistrantActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to check in a registrant.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("event_registrations")
    .update({ checked_in_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return { error: "Could not check in this registrant. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

export async function undoCheckInAction(
  id: string,
): Promise<RegistrantActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to undo a check-in.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("event_registrations")
    .update({ checked_in_at: null })
    .eq("id", id);

  if (error) {
    return { error: "Could not undo this check-in. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
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
  if ("error" in parsed) return parsed;

  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to edit a rider profile.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const { error } = await supabase.rpc("set_registrant_rider_profile", {
    p_registration_id: registrationId,
    p_riding_discipline: parsed.data.riding_discipline,
    p_ski_experience_level: parsed.data.ski_experience_level,
    p_snowboard_experience_level: parsed.data.snowboard_experience_level,
    p_preferred_mountain: parsed.data.preferred_mountain,
  });

  if (error) {
    return {
      error:
        error.message === "REGISTRANT_NOT_FOUND"
          ? "That registration no longer exists."
          : "Could not save this rider profile. Please try again.",
    };
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
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  if (!Number.isInteger(partySize) || partySize < 1) {
    return { error: "Party size must be at least 1." };
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
      return {
        error: "This person already has a registration for this event.",
      };
    }
    return { error: "Could not add this registrant. Please try again." };
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
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  if (!Number.isInteger(partySize) || partySize < 1) {
    return { error: "Party size must be at least 1." };
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
      return {
        error:
          "This person already has a registration for this event. Check them in from the existing row instead.",
      };
    }
    return { error: "Could not check in this walk-in. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}
