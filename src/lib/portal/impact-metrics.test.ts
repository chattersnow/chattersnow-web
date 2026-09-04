import { describe, expect, test } from "bun:test";
import {
  computeEventImpactDerived,
  countBeginnerParticipants,
  countCheckedIn,
  countProfiledAttendees,
  countVolunteerParticipants,
} from "./impact-metrics";

describe("countVolunteerParticipants", () => {
  test("counts someone once when they both signed up and logged hours", () => {
    expect(
      countVolunteerParticipants(
        [{ event_id: "e1", person_id: "p1" }],
        [{ event_id: "e1", person_id: "p1" }],
      ),
    ).toBe(1);
  });

  test("counts a walk-up volunteer who only ever had hours logged", () => {
    expect(
      countVolunteerParticipants([], [{ event_id: "e1", person_id: "p1" }]),
    ).toBe(1);
  });

  test("counts a signup nobody logged hours for", () => {
    expect(
      countVolunteerParticipants([{ event_id: "e1", person_id: "p1" }], []),
    ).toBe(1);
  });

  test("counts the same person once per event, not once overall", () => {
    expect(
      countVolunteerParticipants(
        [
          { event_id: "e1", person_id: "p1" },
          { event_id: "e2", person_id: "p1" },
        ],
        [],
      ),
    ).toBe(2);
  });

  test("ignores rows with no person or no event", () => {
    expect(
      countVolunteerParticipants(
        [
          { event_id: "e1", person_id: null },
          { event_id: null, person_id: "p1" },
        ],
        [],
      ),
    ).toBe(0);
  });
});

describe("countBeginnerParticipants / countProfiledAttendees", () => {
  test("counts distinct beginners per event", () => {
    expect(
      countBeginnerParticipants([
        { event_id: "e1", person_id: "p1" },
        { event_id: "e1", person_id: "p2" },
      ]),
    ).toBe(2);
  });

  test("the denominator counts everyone with a profile, beginners included", () => {
    expect(
      countProfiledAttendees([
        { event_id: "e1", person_id: "p1" },
        { event_id: "e1", person_id: "p2" },
        { event_id: "e1", person_id: "p3" },
      ]),
    ).toBe(3);
  });
});

describe("countCheckedIn", () => {
  test("ignores registrants who never checked in", () => {
    expect(
      countCheckedIn([
        { person_id: "p1", event_id: "e1", checked_in_at: "2026-01-01" },
        { person_id: "p2", event_id: "e1", checked_in_at: null },
      ]),
    ).toBe(1);
  });
});

describe("computeEventImpactDerived", () => {
  const registrations = [
    { person_id: "p1", event_id: "e1", checked_in_at: "2026-01-01" },
    { person_id: "p2", event_id: "e1", checked_in_at: "2026-01-01" },
    { person_id: "p3", event_id: "e1", checked_in_at: null },
  ];
  const checkinCounts = [
    { person_id: "p1", checked_in_event_count: 1 },
    { person_id: "p2", checked_in_event_count: 4 },
  ];

  const baseInput = {
    events: [{ event_id: "e1", attendance_count: 30 }],
    registrations,
    checkinCounts,
    eventVolunteers: [{ event_id: "e1", person_id: "v1" }],
    volunteerHourPeople: [],
    discountCodes: [{ event_id: "e1", registration_id: "r1" }],
    beginnerAttendees: [{ event_id: "e1", person_id: "p1" }],
    profiledAttendees: [
      { event_id: "e1", person_id: "p1" },
      { event_id: "e1", person_id: "p2" },
    ],
    autoAssignDiscountCodes: false,
  };

  test("the typed headcount wins over check-ins, which stay as reference", () => {
    const result = computeEventImpactDerived(baseInput);
    expect(result.participants).toBe(30);
    expect(result.checkedIn).toBe(2);
  });

  test("falls back to check-ins only when no headcount was recorded", () => {
    const result = computeEventImpactDerived({
      ...baseInput,
      events: [{ event_id: "e1", attendance_count: null }],
    });
    expect(result.participants).toBe(2);
  });

  test("splits checked-in attendees into first-time and recurring", () => {
    const result = computeEventImpactDerived(baseInput);
    expect(result.firstTimeParticipants).toBe(1);
    expect(result.recurringParticipants).toBe(1);
  });

  test("nulls the restricted figures when the RPC withheld them", () => {
    const result = computeEventImpactDerived({
      ...baseInput,
      discountCodes: null,
      beginnerAttendees: null,
      profiledAttendees: null,
    });
    expect(result.discountCodesAssigned).toBeNull();
    expect(result.beginnerParticipants).toBeNull();
    expect(result.profiledAttendees).toBeNull();
    // Figures the viewer is allowed to see still compute.
    expect(result.participants).toBe(30);
  });

  test("carries the auto-assign flag so the card can caption the code count", () => {
    expect(
      computeEventImpactDerived({ ...baseInput, autoAssignDiscountCodes: true })
        .autoAssignDiscountCodes,
    ).toBe(true);
  });
});
