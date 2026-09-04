// Single home for every impact figure's definition.
//
// Both the per-event Impact card (get_event_impact_derived_data) and the Program
// Impact Report (get_program_impact_rollup_data) call these same functions over
// the same row shapes, so the two surfaces cannot drift apart. Two RPCs, one set
// of definitions — if you change a rule here, both move together.

export type ImpactNoteRow = {
  event_id: string;
  rental_subsidies_count: number | string | null;
  assistance_total: number | string | null;
};

export type DistributedMovementRow = {
  quantity: number | string;
  event_id: string | null;
};
export type VolunteerHoursRow = {
  event_id: string | null;
  hours: number | string;
};
export type RegistrationRow = {
  person_id: string | null;
  event_id: string;
  checked_in_at: string | null;
};

export type EventRow = {
  event_id: string;
  attendance_count: number | string | null;
};

export type CheckinCountRow = {
  person_id: string;
  checked_in_event_count: number | string;
};

export type DiscountCodeRow = {
  event_id: string;
  registration_id: string | null;
};

/** A person attached to an event: volunteer signups, hours loggers, beginners. */
export type PersonEventRow = {
  event_id: string | null;
  person_id: string | null;
};

export function toNumber(value: number | string | null): number {
  if (value === null || value === undefined) return 0;
  const numeric = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(numeric) ? numeric : 0;
}

function sumNotes(
  notes: ImpactNoteRow[],
  key: Exclude<keyof ImpactNoteRow, "event_id">,
): number {
  return notes.reduce((total, note) => total + toNumber(note[key]), 0);
}

export function sumDistributedQuantity(
  movements: DistributedMovementRow[],
): number {
  return movements.reduce(
    (total, movement) => total + toNumber(movement.quantity),
    0,
  );
}

export function sumVolunteerHours(rows: VolunteerHoursRow[]): number {
  return rows.reduce((total, row) => total + toNumber(row.hours), 0);
}

export function countRepeatParticipants(
  registrations: RegistrationRow[],
): number {
  const eventsByPerson = new Map<string, Set<string>>();
  for (const registration of registrations) {
    if (!registration.person_id) continue;
    const events =
      eventsByPerson.get(registration.person_id) ?? new Set<string>();
    events.add(registration.event_id);
    eventsByPerson.set(registration.person_id, events);
  }
  let repeatCount = 0;
  for (const events of eventsByPerson.values()) {
    if (events.size >= 2) repeatCount += 1;
  }
  return repeatCount;
}

export function computeParticipants(
  events: EventRow[],
  registrations: RegistrationRow[],
): number {
  const checkedInCountByEvent = new Map<string, number>();
  for (const registration of registrations) {
    if (!registration.checked_in_at) continue;
    checkedInCountByEvent.set(
      registration.event_id,
      (checkedInCountByEvent.get(registration.event_id) ?? 0) + 1,
    );
  }

  return events.reduce((total, event) => {
    const hasManualCount =
      event.attendance_count !== null && event.attendance_count !== undefined;
    const count = hasManualCount
      ? toNumber(event.attendance_count)
      : (checkedInCountByEvent.get(event.event_id) ?? 0);
    return total + count;
  }, 0);
}

/** Checked-in registrations only — the headcount ignores who was there. */
export function countCheckedIn(registrations: RegistrationRow[]): number {
  return registrations.filter((row) => row.checked_in_at !== null).length;
}

export function computeFirstTimeParticipants(
  registrations: RegistrationRow[],
  checkinCounts: CheckinCountRow[],
): number {
  const eventCountByPerson = new Map<string, number>();
  for (const row of checkinCounts) {
    eventCountByPerson.set(row.person_id, toNumber(row.checked_in_event_count));
  }

  const seen = new Set<string>();
  let firstTime = 0;
  for (const registration of registrations) {
    if (!registration.person_id || !registration.checked_in_at) continue;
    if (seen.has(registration.person_id)) continue;
    seen.add(registration.person_id);
    if ((eventCountByPerson.get(registration.person_id) ?? 0) === 1) {
      firstTime += 1;
    }
  }
  return firstTime;
}

export function countSubsidizedTickets(
  discountCodes: DiscountCodeRow[],
): number {
  return discountCodes.filter((row) => row.registration_id !== null).length;
}

/**
 * Distinct people per event, summed across events.
 *
 * Deliberately a participation count, not a unique-people count: someone who
 * volunteered at three events counts three times, the same way `participants`
 * does. Don't add it to a "unique volunteers" figure.
 */
function countDistinctPeoplePerEvent(...sources: PersonEventRow[][]): number {
  const peopleByEvent = new Map<string, Set<string>>();
  for (const rows of sources) {
    for (const row of rows) {
      if (!row.event_id || !row.person_id) continue;
      const people = peopleByEvent.get(row.event_id) ?? new Set<string>();
      people.add(row.person_id);
      peopleByEvent.set(row.event_id, people);
    }
  }
  let total = 0;
  for (const people of peopleByEvent.values()) total += people.size;
  return total;
}

/**
 * Volunteers on site = signed up OR logged hours.
 *
 * Either source alone misses a real case: `event_volunteers` misses the walk-up
 * volunteer nobody pre-registered, and `volunteer_hours` misses everyone who
 * showed up on a day nobody got round to logging hours.
 */
export function countVolunteerParticipants(
  signups: PersonEventRow[],
  hoursLoggers: PersonEventRow[],
): number {
  return countDistinctPeoplePerEvent(signups, hoursLoggers);
}

/**
 * Checked-in attendees whose person record says beginner on ski or snowboard.
 *
 * Scoped to checked-in registrants so it is comparable with first-time
 * participants. The rider profile is opt-in and was never backfilled, so always
 * show this against `countProfiledAttendees` as a denominator — on its own it
 * reads 0 for every historical event.
 */
export function countBeginnerParticipants(
  beginnerAttendees: PersonEventRow[],
): number {
  return countDistinctPeoplePerEvent(beginnerAttendees);
}

/** Checked-in attendees with any rider profile on file — the honest denominator. */
export function countProfiledAttendees(
  profiledAttendees: PersonEventRow[],
): number {
  return countDistinctPeoplePerEvent(profiledAttendees);
}

// ---------------------------------------------------------------------------
// Per-event figures (Impact card + Attendance card)
// ---------------------------------------------------------------------------

export type EventImpactDerivedInput = {
  events: EventRow[];
  registrations: RegistrationRow[];
  checkinCounts: CheckinCountRow[];
  eventVolunteers: PersonEventRow[];
  volunteerHourPeople: PersonEventRow[];
  /** null when the caller lacks event_impact:view — see 20260904030000. */
  discountCodes: DiscountCodeRow[] | null;
  beginnerAttendees: PersonEventRow[] | null;
  profiledAttendees: PersonEventRow[] | null;
  autoAssignDiscountCodes: boolean;
};

export type EventImpactDerived = {
  /** events.attendance_count when set, else checked-in registrations. */
  participants: number;
  /** Shown beside participants as reference, never as a replacement. */
  checkedIn: number;
  firstTimeParticipants: number;
  recurringParticipants: number;
  volunteerParticipants: number;
  /** null when the viewer may not see rider-profile data. */
  beginnerParticipants: number | null;
  profiledAttendees: number | null;
  /** null when the viewer may not see discount data. */
  discountCodesAssigned: number | null;
  /** True when every registrant is auto-assigned a code, so it isn't a subsidy signal. */
  autoAssignDiscountCodes: boolean;
};

export function computeEventImpactDerived(
  input: EventImpactDerivedInput,
): EventImpactDerived {
  const checkedIn = countCheckedIn(input.registrations);
  const firstTimeParticipants = computeFirstTimeParticipants(
    input.registrations,
    input.checkinCounts,
  );

  return {
    participants: computeParticipants(input.events, input.registrations),
    checkedIn,
    firstTimeParticipants,
    recurringParticipants: Math.max(checkedIn - firstTimeParticipants, 0),
    volunteerParticipants: countVolunteerParticipants(
      input.eventVolunteers,
      input.volunteerHourPeople,
    ),
    beginnerParticipants: input.beginnerAttendees
      ? countBeginnerParticipants(input.beginnerAttendees)
      : null,
    profiledAttendees: input.profiledAttendees
      ? countProfiledAttendees(input.profiledAttendees)
      : null,
    discountCodesAssigned: input.discountCodes
      ? countSubsidizedTickets(input.discountCodes)
      : null,
    autoAssignDiscountCodes: input.autoAssignDiscountCodes,
  };
}

// ---------------------------------------------------------------------------
// Program rollup
// ---------------------------------------------------------------------------

export type ProgramImpactRollup = {
  eventCount: number;
  participants: number;
  firstTimeParticipants: number;
  beginnerParticipants: number;
  profiledAttendees: number;
  volunteerParticipants: number;
  assistedParticipants: number;
  equipmentDistributed: number;
  volunteerHours: number;
  participantAssistanceTotal: number;
  repeatParticipants: number;
};

export type ProgramImpactRollupInput = {
  eventCount: number;
  events: EventRow[];
  notes: ImpactNoteRow[];
  distributedMovements: DistributedMovementRow[];
  volunteerHours: VolunteerHoursRow[];
  registrations: RegistrationRow[];
  checkinCounts: CheckinCountRow[];
  discountCodes: DiscountCodeRow[];
  eventVolunteers: PersonEventRow[];
  volunteerHourPeople: PersonEventRow[];
  beginnerAttendees: PersonEventRow[];
  profiledAttendees: PersonEventRow[];
};

export function computeProgramImpactRollup(
  input: ProgramImpactRollupInput,
): ProgramImpactRollup {
  return {
    eventCount: input.eventCount,
    participants: computeParticipants(input.events, input.registrations),
    firstTimeParticipants: computeFirstTimeParticipants(
      input.registrations,
      input.checkinCounts,
    ),
    beginnerParticipants: countBeginnerParticipants(input.beginnerAttendees),
    profiledAttendees: countProfiledAttendees(input.profiledAttendees),
    volunteerParticipants: countVolunteerParticipants(
      input.eventVolunteers,
      input.volunteerHourPeople,
    ),
    // Discount codes assigned to a registrant, plus staff-entered rental
    // subsidies. Undercounts internally-granted scholarships and fee waivers,
    // which aren't modelled anywhere in the schema.
    assistedParticipants:
      countSubsidizedTickets(input.discountCodes) +
      sumNotes(input.notes, "rental_subsidies_count"),
    equipmentDistributed: sumDistributedQuantity(input.distributedMovements),
    volunteerHours: sumVolunteerHours(input.volunteerHours),
    participantAssistanceTotal: sumNotes(input.notes, "assistance_total"),
    repeatParticipants: countRepeatParticipants(input.registrations),
  };
}
