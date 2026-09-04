"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  computeEventImpactDerived,
  type CheckinCountRow,
  type DiscountCodeRow,
  type EventImpactDerived,
  type EventRow,
  type PersonEventRow,
  type RegistrationRow,
} from "@/lib/portal/impact-metrics";

type DerivedData = {
  auto_assign_discount_codes: boolean;
  events: EventRow[];
  registrations: RegistrationRow[];
  checkin_counts: CheckinCountRow[];
  event_volunteers: PersonEventRow[];
  volunteer_hour_people: PersonEventRow[];
  discount_codes: DiscountCodeRow[] | null;
  beginner_attendees: PersonEventRow[] | null;
  profiled_attendees: PersonEventRow[] | null;
};

/**
 * Figures the Impact and Attendance cards used to ask staff to type by hand.
 *
 * Goes through the get_event_impact_derived_data RPC rather than querying the
 * tables directly because the board role holds event_impact:view but events:none
 * and people:none — an RLS-scoped query would silently return zeros for exactly
 * the role that opens this card to report. The RPC is security definer and does
 * its own permission check; it returns null for the discount and rider-profile
 * keys when the caller only has events:view.
 */
export async function getEventImpactDerivedAction(
  eventId: string,
): Promise<{ data: EventImpactDerived } | { error: string }> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("get_event_impact_derived_data", {
    p_event_id: eventId,
  });

  if (error) {
    return { error: "Could not load the computed figures. Please try again." };
  }

  const result = (data ?? {}) as Partial<DerivedData>;

  return {
    data: computeEventImpactDerived({
      events: result.events ?? [],
      registrations: result.registrations ?? [],
      checkinCounts: result.checkin_counts ?? [],
      eventVolunteers: result.event_volunteers ?? [],
      volunteerHourPeople: result.volunteer_hour_people ?? [],
      discountCodes: result.discount_codes ?? null,
      beginnerAttendees: result.beginner_attendees ?? null,
      profiledAttendees: result.profiled_attendees ?? null,
      autoAssignDiscountCodes: result.auto_assign_discount_codes ?? false,
    }),
  };
}
