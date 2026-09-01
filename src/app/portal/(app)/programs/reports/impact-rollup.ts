export type ImpactNoteRow = {
  event_id: string;
  total_participants: number | string | null;
  first_time_participants: number | string | null;
  beginner_participants: number | string | null;
  subsidized_tickets_count: number | string | null;
  rental_subsidies_count: number | string | null;
  equipment_loans_count: number | string | null;
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

export type ProgramImpactRollup = {
  eventCount: number;
  participants: number;
  firstTimeParticipants: number;
  beginnerParticipants: number;
  assistedParticipants: number;
  equipmentLoans: number;
  equipmentDistributed: number;
  volunteerHours: number;
  participantAssistanceTotal: number;
  repeatParticipants: number;
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

export type ProgramImpactRollupInput = {
  eventCount: number;
  events: EventRow[];
  notes: ImpactNoteRow[];
  distributedMovements: DistributedMovementRow[];
  volunteerHours: VolunteerHoursRow[];
  registrations: RegistrationRow[];
  checkinCounts: CheckinCountRow[];
  discountCodes: DiscountCodeRow[];
};

export function computeProgramImpactRollup(
  input: ProgramImpactRollupInput,
): ProgramImpactRollup {
  const {
    eventCount,
    events,
    notes,
    distributedMovements,
    volunteerHours,
    registrations,
    checkinCounts,
    discountCodes,
  } = input;

  return {
    eventCount,
    participants: computeParticipants(events, registrations),
    firstTimeParticipants: computeFirstTimeParticipants(
      registrations,
      checkinCounts,
    ),
    beginnerParticipants: sumNotes(notes, "beginner_participants"),
    assistedParticipants:
      countSubsidizedTickets(discountCodes) +
      sumNotes(notes, "rental_subsidies_count"),
    equipmentLoans: sumNotes(notes, "equipment_loans_count"),
    equipmentDistributed: sumDistributedQuantity(distributedMovements),
    volunteerHours: sumVolunteerHours(volunteerHours),
    participantAssistanceTotal: sumNotes(notes, "assistance_total"),
    repeatParticipants: countRepeatParticipants(registrations),
  };
}
