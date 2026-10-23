import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CarpoolCar,
  CarpoolPerson,
  EventCarpools,
} from "@/lib/event-carpools";
import {
  toCarpoolAssignment,
  type CarpoolAssignment,
  type CarpoolAssignmentRecipient,
} from "@/lib/carpool-assignment";

/**
 * The event's carpool plan (#1649), read at `events: view` under RLS. Null
 * when the event's switch is off, or the read fails -- which hides every
 * carpool surface rather than showing a plan it could not check.
 *
 * Names and party sizes come from `people`, the event's active registrations
 * the caller has already read: a driver or passenger is always one, since
 * cancelling takes a registration out of its car.
 */
export async function loadEventCarpools(
  supabase: SupabaseClient,
  eventId: string,
  people: readonly CarpoolPerson[],
): Promise<EventCarpools> {
  const { data: event } = await supabase
    .from("events")
    .select("carpools_enabled, carpool_seats_question_id")
    .eq("id", eventId)
    .maybeSingle<{
      carpools_enabled: boolean;
      carpool_seats_question_id: string | null;
    }>();
  if (!event?.carpools_enabled) return null;

  const [cars, passengers, markers] = await Promise.all([
    supabase
      .from("event_carpool_cars")
      .select(
        "id, label, seats, leaving_from, notes, driver_registration_id, driver_assigned_at, sort_order",
      )
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("event_carpool_passengers")
      .select(
        "car_id, registration_id, added_at, paid_driver_at, paid_marked_by",
      )
      .eq("event_id", eventId)
      .order("added_at", { ascending: true }),
    // A failure only loses the "by" on a paid tick.
    supabase.rpc("event_carpool_markers", { p_event_id: eventId }),
  ]);
  if (cars.error || passengers.error) return null;

  const byId = new Map(people.map((person) => [person.registrationId, person]));
  const markerNames = new Map(
    ((markers.data ?? []) as { user_id: string; name: string | null }[]).map(
      (row) => [row.user_id, row.name],
    ),
  );

  return {
    seatsQuestionId: event.carpool_seats_question_id,
    cars: (cars.data ?? []).map((car): CarpoolCar => {
      const driver = car.driver_registration_id
        ? byId.get(car.driver_registration_id)
        : undefined;
      return {
        id: car.id,
        label: car.label,
        seats: car.seats,
        leavingFrom: car.leaving_from,
        notes: car.notes,
        driver: driver
          ? { ...driver, assignedAt: car.driver_assigned_at }
          : null,
        passengers: (passengers.data ?? []).flatMap((row) => {
          const person =
            row.car_id === car.id ? byId.get(row.registration_id) : undefined;
          return person
            ? [
                {
                  ...person,
                  addedAt: row.added_at,
                  paidAt: row.paid_driver_at,
                  paidByName: row.paid_marked_by
                    ? (markerNames.get(row.paid_marked_by) ?? null)
                    : null,
                },
              ]
            : [];
        }),
      };
    }),
  };
}

/** One person in a car, as "Email carpool assignments" would reach them. */
export type CarpoolAssignmentRow = CarpoolAssignmentRecipient & {
  name: string;
  email: string;
  personId: string | null;
  car: CarpoolAssignment;
  signature: string;
};

/**
 * Everyone in a car on the event with the card they would be sent (#1651),
 * through `event_carpool_assignment_recipients()` at `events: manage`. Null
 * where the read is refused or fails -- carpools off, or no permission -- which
 * the board shows as nothing to send.
 */
export async function loadCarpoolAssignmentRows(
  supabase: SupabaseClient,
  eventId: string,
): Promise<CarpoolAssignmentRow[] | null> {
  const { data, error } = await supabase.rpc(
    "event_carpool_assignment_recipients",
    { p_event_id: eventId },
  );
  if (error) return null;
  return (
    (data ?? []) as {
      registration_id: string;
      name: string | null;
      email: string | null;
      person_id: string | null;
      card: unknown;
      signature: string;
      changed: boolean;
    }[]
  ).flatMap((row) => {
    const car = toCarpoolAssignment(row.card);
    const email = row.email?.trim() ?? "";
    return car
      ? [
          {
            registrationId: row.registration_id,
            name: (row.name ?? "").trim(),
            email,
            hasEmail: email.length > 0,
            personId: row.person_id,
            car,
            signature: row.signature,
            changed: row.changed,
          },
        ]
      : [];
  });
}
