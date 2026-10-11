import { describe, expect, test } from "bun:test";
import {
  computeEventImpactDerived,
  computeParticipantAssistance,
  computePeopleServed,
  countBeginnerParticipants,
  countCheckedIn,
  countFirstTimeOnSnow,
  countProfiledAttendees,
  countRentalSubsidies,
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
    discountCodes: [
      { event_id: "e1", registration_id: "r1", kind: "rental", value: "45" },
    ],
    beginnerAttendees: [{ event_id: "e1", person_id: "p1" }],
    firstTimeAttendees: [{ event_id: "e1", person_id: "p2" }],
    assistanceExpenses: [{ event_id: "e1", amount: "100.00" }],
    profiledAttendees: [
      { event_id: "e1", person_id: "p1" },
      { event_id: "e1", person_id: "p2" },
    ],
    autoAssignDiscountCodes: false,
    distributions: [
      {
        event_id: "e1",
        quantity: 2,
        recipient_person_id: "p1",
        inventory_item_id: "i1",
        face_value: "40.00",
      },
    ],
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
      firstTimeAttendees: null,
      profiledAttendees: null,
      assistanceExpenses: null,
    });
    expect(result.discountCodesAssigned).toBeNull();
    expect(result.rentalSubsidies).toBeNull();
    expect(result.assistance).toBeNull();
    expect(result.beginnerParticipants).toBeNull();
    expect(result.firstTimeOnSnow).toBeNull();
    expect(result.profiledAttendees).toBeNull();
    // Figures the viewer is allowed to see still compute.
    expect(result.participants).toBe(30);
  });

  test("includes people served from the event's distributions", () => {
    expect(computeEventImpactDerived(baseInput).peopleServed).toEqual({
      distributed: 2,
      recipients: 1,
      value: 40,
    });
  });

  test("carries the auto-assign flag so the card can caption the code count", () => {
    expect(
      computeEventImpactDerived({ ...baseInput, autoAssignDiscountCodes: true })
        .autoAssignDiscountCodes,
    ).toBe(true);
  });

  // #1588: the four typed figures, derived.
  test("derives first time on snow, rental subsidies and assistance", () => {
    const result = computeEventImpactDerived(baseInput);
    expect(result.firstTimeOnSnow).toBe(1);
    expect(result.rentalSubsidies).toBe(1);
    expect(result.assistance).toEqual({
      discountCodes: 45,
      distributions: 40,
      expenses: 100,
      total: 185,
    });
  });

  test("on an auto-assign event, codes are neither subsidy nor assistance", () => {
    const result = computeEventImpactDerived({
      ...baseInput,
      autoAssignDiscountCodes: true,
    });
    // Still counted as assigned, with the card's caveat beside it.
    expect(result.discountCodesAssigned).toBe(1);
    expect(result.rentalSubsidies).toBe(0);
    expect(result.assistance).toEqual({
      discountCodes: 0,
      distributions: 40,
      expenses: 100,
      total: 140,
    });
  });
});

describe("countFirstTimeOnSnow", () => {
  test("counts distinct first-timers per event", () => {
    expect(
      countFirstTimeOnSnow([
        { event_id: "e1", person_id: "p1" },
        { event_id: "e1", person_id: "p1" },
        { event_id: "e2", person_id: "p1" },
      ]),
    ).toBe(2);
  });
});

describe("countRentalSubsidies", () => {
  const events = [
    { event_id: "e1", attendance_count: null },
    {
      event_id: "e2",
      attendance_count: null,
      auto_assign_discount_codes: true,
    },
  ];

  test("counts assigned rental codes only", () => {
    expect(
      countRentalSubsidies(
        [
          { event_id: "e1", registration_id: "r1", kind: "rental" },
          { event_id: "e1", registration_id: "r2", kind: "lift" },
          { event_id: "e1", registration_id: "r3", kind: null },
          { event_id: "e1", registration_id: null, kind: "rental" },
        ],
        events,
      ),
    ).toBe(1);
  });

  test("skips codes on an event that gives one to every registrant", () => {
    expect(
      countRentalSubsidies(
        [
          { event_id: "e1", registration_id: "r1", kind: "rental" },
          { event_id: "e2", registration_id: "r2", kind: "rental" },
        ],
        events,
      ),
    ).toBe(1);
  });
});

describe("computeParticipantAssistance", () => {
  const events = [
    { event_id: "e1", attendance_count: null },
    {
      event_id: "e2",
      attendance_count: null,
      auto_assign_discount_codes: true,
    },
  ];

  test("adds code values, value given out and paid assistance expenses", () => {
    expect(
      computeParticipantAssistance(
        [
          { event_id: "e1", registration_id: "r1", kind: "lift", value: 60 },
          {
            event_id: "e1",
            registration_id: "r2",
            kind: "rental",
            value: "45.50",
          },
          // No value recorded: counts as nothing, not NaN.
          { event_id: "e1", registration_id: "r3", kind: "rental" },
          // Unassigned: helped nobody yet.
          { event_id: "e1", registration_id: null, value: 99 },
          // Auto-assigned: not evidence of subsidy.
          { event_id: "e2", registration_id: "r4", value: 25 },
        ],
        events,
        80,
        [
          { event_id: "e1", amount: "120.00" },
          { event_id: "e2", amount: 30 },
        ],
      ),
    ).toEqual({
      discountCodes: 105.5,
      distributions: 80,
      expenses: 150,
      total: 335.5,
    });
  });

  test("is all zeroes with nothing recorded", () => {
    expect(computeParticipantAssistance([], [], 0, [])).toEqual({
      discountCodes: 0,
      distributions: 0,
      expenses: 0,
      total: 0,
    });
  });
});

describe("computePeopleServed", () => {
  test("sums units, counts each recipient once per event and each item's value once", () => {
    expect(
      computePeopleServed([
        // p1 received two items at e1: one person served there.
        {
          event_id: "e1",
          quantity: 1,
          recipient_person_id: "p1",
          inventory_item_id: "i1",
          face_value: "25.00",
        },
        {
          event_id: "e1",
          quantity: 1,
          recipient_person_id: "p1",
          inventory_item_id: "i2",
          face_value: 10,
        },
        // p1 again at e2 counts again, like participants.
        {
          event_id: "e2",
          quantity: 3,
          recipient_person_id: "p1",
          inventory_item_id: "i3",
          face_value: null,
        },
        // No recipient recorded: units given out, nobody counted.
        {
          event_id: "e2",
          quantity: "2",
          recipient_person_id: null,
          inventory_item_id: "i4",
          face_value: 5,
        },
        // A second movement of i1 does not count its value twice.
        {
          event_id: "e1",
          quantity: 1,
          recipient_person_id: "p2",
          inventory_item_id: "i1",
          face_value: "25.00",
        },
      ]),
    ).toEqual({ distributed: 8, recipients: 3, value: 40 });
  });

  test("is all zeroes with nothing distributed", () => {
    expect(computePeopleServed([])).toEqual({
      distributed: 0,
      recipients: 0,
      value: 0,
    });
  });

  test("tolerates rows from before recipients and values were returned", () => {
    expect(computePeopleServed([{ quantity: 4, event_id: "e1" }])).toEqual({
      distributed: 4,
      recipients: 0,
      value: 0,
    });
  });
});
