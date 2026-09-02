"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";

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
};

export async function listEventRegistrantsAction(
  eventId: string,
): Promise<{ data: EventRegistrant[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "events", "view");
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("event_registrations")
    .select(
      "id, event_id, name, email, phone, party_size, notes, created_at, person_id, checked_in_at",
    )
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (error) {
    return { error: "Could not load registrants. Please try again." };
  }
  return { data: (data ?? []) as EventRegistrant[] };
}

export type EventAttendanceBreakdown = {
  recurring: number;
  firstTime: number;
};

export async function getEventAttendanceBreakdownAction(
  eventId: string,
): Promise<{ data: EventAttendanceBreakdown } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "events", "view");
  if (permissionError) return permissionError;

  const { data: checkedInHere, error: checkedInError } = await supabase
    .from("event_registrations")
    .select("person_id")
    .eq("event_id", eventId)
    .not("checked_in_at", "is", null)
    .not("person_id", "is", null);
  if (checkedInError) {
    return { error: "Could not load attendance stats. Please try again." };
  }

  const personIds = [
    ...new Set((checkedInHere ?? []).map((row) => row.person_id as string)),
  ];
  if (personIds.length === 0) return { data: { recurring: 0, firstTime: 0 } };

  const { data: allAttended, error: allAttendedError } = await supabase
    .from("event_registrations")
    .select("person_id, event_id")
    .in("person_id", personIds)
    .not("checked_in_at", "is", null);
  if (allAttendedError) {
    return { error: "Could not load attendance stats. Please try again." };
  }

  const attendedEventsByPerson = new Map<string, Set<string>>();
  for (const row of allAttended ?? []) {
    const personId = row.person_id as string;
    const events = attendedEventsByPerson.get(personId) ?? new Set<string>();
    events.add(row.event_id as string);
    attendedEventsByPerson.set(personId, events);
  }

  let recurring = 0;
  let firstTime = 0;
  for (const personId of personIds) {
    const attendedCount = attendedEventsByPerson.get(personId)?.size ?? 1;
    if (attendedCount > 1) recurring += 1;
    else firstTime += 1;
  }

  return { data: { recurring, firstTime } };
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
