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
export type RegistrationRow = { person_id: string | null; event_id: string };

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

export function computeProgramImpactRollup(
  eventCount: number,
  notes: ImpactNoteRow[],
  distributedMovements: DistributedMovementRow[],
  volunteerHours: VolunteerHoursRow[],
  registrations: RegistrationRow[],
): ProgramImpactRollup {
  return {
    eventCount,
    participants: sumNotes(notes, "total_participants"),
    firstTimeParticipants: sumNotes(notes, "first_time_participants"),
    beginnerParticipants: sumNotes(notes, "beginner_participants"),
    assistedParticipants:
      sumNotes(notes, "subsidized_tickets_count") +
      sumNotes(notes, "rental_subsidies_count"),
    equipmentLoans: sumNotes(notes, "equipment_loans_count"),
    equipmentDistributed: sumDistributedQuantity(distributedMovements),
    volunteerHours: sumVolunteerHours(volunteerHours),
    participantAssistanceTotal: sumNotes(notes, "assistance_total"),
    repeatParticipants: countRepeatParticipants(registrations),
  };
}
