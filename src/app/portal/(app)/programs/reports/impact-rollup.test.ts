import { describe, expect, test } from "bun:test";
import {
  computeProgramImpactRollup,
  countRepeatParticipants,
  sumDistributedQuantity,
  sumVolunteerHours,
  toNumber,
} from "./impact-rollup";

describe("toNumber", () => {
  test("coerces numeric strings", () => {
    expect(toNumber("12.5")).toBe(12.5);
  });

  test("returns 0 for null", () => {
    expect(toNumber(null)).toBe(0);
  });

  test("returns 0 for non-numeric strings", () => {
    expect(toNumber("abc")).toBe(0);
  });
});

describe("sumDistributedQuantity", () => {
  test("sums quantity across rows", () => {
    const movements = [
      { quantity: 3, event_id: "e1" },
      { quantity: "2", event_id: "e1" },
    ];
    expect(sumDistributedQuantity(movements)).toBe(5);
  });

  test("returns 0 for an empty list", () => {
    expect(sumDistributedQuantity([])).toBe(0);
  });
});

describe("sumVolunteerHours", () => {
  test("sums numeric and string hours", () => {
    const hours = [
      { event_id: "e1", hours: 4 },
      { event_id: "e2", hours: "1.5" },
    ];
    expect(sumVolunteerHours(hours)).toBe(5.5);
  });

  test("treats a non-numeric hours value as 0", () => {
    expect(sumVolunteerHours([{ event_id: "e1", hours: "abc" }])).toBe(0);
  });
});

describe("countRepeatParticipants", () => {
  test("counts a person registered across 2 distinct events", () => {
    const registrations = [
      { person_id: "p1", event_id: "e1" },
      { person_id: "p1", event_id: "e2" },
    ];
    expect(countRepeatParticipants(registrations)).toBe(1);
  });

  test("does not count the same person/event pair twice as a repeat", () => {
    const registrations = [
      { person_id: "p1", event_id: "e1" },
      { person_id: "p1", event_id: "e1" },
    ];
    expect(countRepeatParticipants(registrations)).toBe(0);
  });

  test("ignores rows with no linked person", () => {
    const registrations = [
      { person_id: null, event_id: "e1" },
      { person_id: null, event_id: "e2" },
    ];
    expect(countRepeatParticipants(registrations)).toBe(0);
  });

  test("counts a person in 3 events once", () => {
    const registrations = [
      { person_id: "p1", event_id: "e1" },
      { person_id: "p1", event_id: "e2" },
      { person_id: "p1", event_id: "e3" },
    ];
    expect(countRepeatParticipants(registrations)).toBe(1);
  });
});

describe("computeProgramImpactRollup", () => {
  test("aggregates all 10 metrics from fixture rows", () => {
    const notes = [
      {
        event_id: "e1",
        total_participants: 20,
        first_time_participants: 5,
        beginner_participants: 8,
        subsidized_tickets_count: 3,
        rental_subsidies_count: 2,
        equipment_loans_count: 4,
        assistance_total: "150.00",
      },
      {
        event_id: "e2",
        total_participants: 15,
        first_time_participants: 2,
        beginner_participants: 3,
        subsidized_tickets_count: 1,
        rental_subsidies_count: 0,
        equipment_loans_count: 1,
        assistance_total: 50,
      },
    ];
    const distributedMovements = [
      { quantity: 6, event_id: "e1" },
      { quantity: 4, event_id: "e2" },
    ];
    const volunteerHours = [
      { event_id: "e1", hours: 10 },
      { event_id: "e2", hours: "5.5" },
    ];
    const registrations = [
      { person_id: "p1", event_id: "e1" },
      { person_id: "p1", event_id: "e2" },
      { person_id: "p2", event_id: "e1" },
    ];

    expect(
      computeProgramImpactRollup(
        2,
        notes,
        distributedMovements,
        volunteerHours,
        registrations,
      ),
    ).toEqual({
      eventCount: 2,
      participants: 35,
      firstTimeParticipants: 7,
      beginnerParticipants: 11,
      assistedParticipants: 6,
      equipmentLoans: 5,
      equipmentDistributed: 10,
      volunteerHours: 15.5,
      participantAssistanceTotal: 200,
      repeatParticipants: 1,
    });
  });

  test("treats a null column on an impact note as 0, not NaN", () => {
    const notes = [
      {
        event_id: "e1",
        total_participants: null,
        first_time_participants: null,
        beginner_participants: null,
        subsidized_tickets_count: null,
        rental_subsidies_count: null,
        equipment_loans_count: null,
        assistance_total: null,
      },
    ];
    const result = computeProgramImpactRollup(1, notes, [], [], []);
    expect(result.participants).toBe(0);
    expect(result.participantAssistanceTotal).toBe(0);
    expect(Number.isNaN(result.assistedParticipants)).toBe(false);
  });

  test("an event with no impact_notes row yet contributes 0 across the board", () => {
    const result = computeProgramImpactRollup(1, [], [], [], []);
    expect(result.eventCount).toBe(1);
    expect(result.participants).toBe(0);
    expect(result.repeatParticipants).toBe(0);
  });
});
