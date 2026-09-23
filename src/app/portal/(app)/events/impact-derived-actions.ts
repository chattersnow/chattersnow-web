"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
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
 *
 * The rider-profile keys are also dropped here for a caller without
 * rider_profiles:view, which carries the rider_profile module (#1408): on a
 * tenant without it there is no "Beginner participants" figure for anyone.
 */
export async function getEventImpactDerivedAction(
  eventId: string,
): Promise<{ data: EventImpactDerived } | { error: string }> {
  const supabase = await createSupabaseServerClient();

  const [{ data, error }, permissions] = await Promise.all([
    supabase.rpc("get_event_impact_derived_data", { p_event_id: eventId }),
    getCurrentUserPermissions(supabase),
  ]);
  const canSeeRider = hasPermission(permissions, "rider_profiles", "view");

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
      beginnerAttendees: canSeeRider
        ? (result.beginner_attendees ?? null)
        : null,
      profiledAttendees: canSeeRider
        ? (result.profiled_attendees ?? null)
        : null,
      autoAssignDiscountCodes: result.auto_assign_discount_codes ?? false,
    }),
  };
}
