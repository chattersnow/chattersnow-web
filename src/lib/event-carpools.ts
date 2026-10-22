/**
 * Carpool cars on an event (#1649): which car, who drives, who rides with
 * whom, and whether each passenger has paid their driver. Shared by the
 * carpool board, the registrants column and detail sheet, the event's
 * Carpools card and the CSV export.
 *
 * A registration takes seats equal to its party size, since a party travels
 * together (#1501), and is in at most one car, as its driver or a passenger.
 */

/** `event_carpool_cars`' checks, mirrored for the form. */
export const CARPOOL_SEATS_MIN = 1;
export const CARPOOL_SEATS_MAX = 12;
export const CARPOOL_LABEL_MAX_LENGTH = 60;
export const CARPOOL_TEXT_MAX_LENGTH = 500;

export type CarpoolPerson = {
  registrationId: string;
  name: string;
  partySize: number;
  /** When the registrant last changed their own answers (#1591). */
  answersChangedAt: string | null;
};

export type CarpoolPassenger = CarpoolPerson & {
  addedAt: string;
  paidAt: string | null;
  paidByName: string | null;
};

export type CarpoolCar = {
  id: string;
  label: string;
  seats: number;
  leavingFrom: string | null;
  notes: string | null;
  /** Null when nobody drives: never set, or the driver cancelled. */
  driver: (CarpoolPerson & { assignedAt: string | null }) | null;
  passengers: CarpoolPassenger[];
};

/**
 * The event's carpool plan as the registrants surfaces read it: null when
 * the switch is off, which leaves every surface as it was.
 */
export type EventCarpools = {
  cars: CarpoolCar[];
  /** The `number` question that prefills a new car's seats, if any. */
  seatsQuestionId: string | null;
} | null;

/** A registration's place in the plan, for its column and detail line. */
export type RegistrantCarpool = {
  carId: string;
  carLabel: string;
  role: "driver" | "passenger";
  /** Passengers only. */
  paid: boolean;
};

export function seatsUsed(car: Pick<CarpoolCar, "passengers">): number {
  return car.passengers.reduce((sum, row) => sum + row.partySize, 0);
}

export function isOverCapacity(
  car: Pick<CarpoolCar, "passengers" | "seats">,
): boolean {
  return seatsUsed(car) > car.seats;
}

export function paidCount(car: Pick<CarpoolCar, "passengers">): {
  paid: number;
  total: number;
} {
  return {
    paid: car.passengers.filter((row) => row.paidAt !== null).length,
    total: car.passengers.length,
  };
}

/**
 * Whether a registrant changed their answers after they were put in this
 * car, so staff should re-check the plan.
 */
export function answersChangedSince(
  answersChangedAt: string | null,
  since: string | null,
): boolean {
  if (!answersChangedAt) return false;
  if (!since) return true;
  return Date.parse(answersChangedAt) > Date.parse(since);
}

/** Every registration in a car, keyed by registration id. */
export function carpoolAssignments(
  cars: readonly CarpoolCar[],
): Map<string, RegistrantCarpool> {
  const assignments = new Map<string, RegistrantCarpool>();
  for (const car of cars) {
    if (car.driver) {
      assignments.set(car.driver.registrationId, {
        carId: car.id,
        carLabel: car.label,
        role: "driver",
        paid: false,
      });
    }
    for (const passenger of car.passengers) {
      assignments.set(passenger.registrationId, {
        carId: car.id,
        carLabel: car.label,
        role: "passenger",
        paid: passenger.paidAt !== null,
      });
    }
  }
  return assignments;
}

/** "Car 2 · Driver", "Car 2 · Passenger · Paid", or "Unassigned". */
export function carpoolLine(carpool: RegistrantCarpool | null): string {
  if (!carpool) return "Unassigned";
  if (carpool.role === "driver") return `${carpool.carLabel} · Driver`;
  return `${carpool.carLabel} · Passenger${carpool.paid ? " · Paid" : ""}`;
}

/** The cars with somebody still to pay, showing only those passengers. */
export function unpaidOnly(cars: readonly CarpoolCar[]): CarpoolCar[] {
  return cars
    .map((car) => ({
      ...car,
      passengers: car.passengers.filter((row) => row.paidAt === null),
    }))
    .filter((car) => car.passengers.length > 0);
}

/**
 * A new car's seats from the driver's answer to the event's seats question:
 * a whole number in range, else null so the form asks.
 */
export function seatsFromAnswer(
  answers: readonly { question_id: string | null; value: unknown }[],
  questionId: string | null,
): number | null {
  if (!questionId) return null;
  const value = answers.find((row) => row.question_id === questionId)?.value;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const seats = Math.trunc(value);
  return seats >= CARPOOL_SEATS_MIN && seats <= CARPOOL_SEATS_MAX
    ? seats
    : null;
}

/** The carpool functions' refusals, as staff read them. */
export const CARPOOL_ERROR_MESSAGES: Record<string, string> = {
  CARPOOLS_DISABLED:
    "This event no longer organizes carpools. Turn it on under Planning first.",
  EVENT_NOT_FOUND: "That event no longer exists.",
  CAR_NOT_FOUND: "That car is no longer on this event. Refresh and try again.",
  REGISTRANT_NOT_FOUND:
    "That registration is no longer on this event. Refresh and try again.",
  REGISTRANT_CANCELLED: "That registration has been cancelled.",
  CARPOOL_ALREADY_ASSIGNED:
    "That registrant is already in a car. Take them out of it first.",
  CARPOOL_SEATS_INVALID: `Seats must be a whole number from ${CARPOOL_SEATS_MIN} to ${CARPOOL_SEATS_MAX}.`,
  CARPOOL_LABEL_TOO_LONG: `The car's name must be ${CARPOOL_LABEL_MAX_LENGTH} characters or fewer.`,
  CARPOOL_TEXT_TOO_LONG: `Leaving from and notes must each be ${CARPOOL_TEXT_MAX_LENGTH} characters or fewer.`,
  PASSENGER_NOT_FOUND:
    "That passenger is no longer in this car. Refresh and try again.",
  CARPOOL_SEATS_QUESTION_INVALID:
    "Seats can only come from a number question on this event.",
};

/** Where the board lives. */
export function carpoolsHref(eventId: string): string {
  return `/portal/events/${encodeURIComponent(eventId)}/carpools`;
}
