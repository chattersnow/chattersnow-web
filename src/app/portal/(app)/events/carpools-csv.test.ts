import { describe, expect, test } from "bun:test";
import type { CarpoolCar } from "@/lib/event-carpools";
import {
  carpoolsCsv,
  carpoolsCsvFilename,
  type CarpoolsCsvRegistration,
} from "./carpools-csv";

const cars: CarpoolCar[] = [
  {
    id: "car-1",
    label: "Car 1",
    seats: 3,
    leavingFrom: "Union Station",
    notes: "Staff note",
    driver: {
      registrationId: "d",
      name: "Dana Driver",
      partySize: 1,
      answersChangedAt: null,
      assignedAt: null,
    },
    passengers: [
      {
        registrationId: "p",
        name: "Pat Passenger",
        partySize: 2,
        answersChangedAt: null,
        addedAt: "2026-10-01T00:00:00Z",
        paidAt: "2026-10-02T00:00:00Z",
        paidByName: null,
      },
      {
        registrationId: "q",
        name: "Quinn Quiet",
        partySize: 1,
        answersChangedAt: null,
        addedAt: "2026-10-01T00:00:00Z",
        paidAt: null,
        paidByName: null,
      },
    ],
  },
];

function registration(
  id: string,
  shares: boolean | null,
): CarpoolsCsvRegistration {
  return {
    id,
    email: `${id}@example.test`,
    phone: "555-0100",
    instagram_handle: `${id}_ig`,
    preferred_contact_detail: null,
    answers:
      shares === null
        ? []
        : [{ question_id: "consent", answer_text: "", value: shares }],
  };
}

const registrations = [
  registration("d", true),
  registration("p", false),
  registration("q", null),
];

describe("carpoolsCsv", () => {
  test("one row per person, the driver first, with no contact columns without a consent question", () => {
    const csv = carpoolsCsv(cars, [], registrations);
    expect(csv.split("\r\n")).toEqual([
      "Car,Role,Name,Party size,Instagram,Paid",
      "Car 1,Driver,Dana Driver,1,d_ig,",
      "Car 1,Passenger,Pat Passenger,2,p_ig,Yes",
      "Car 1,Passenger,Quinn Quiet,1,q_ig,No",
      "",
    ]);
    // Staff-only text never leaves in the file.
    expect(csv).not.toContain("Staff note");
  });

  test("email and phone only on the rows that ticked the consent question", () => {
    const lines = carpoolsCsv(
      cars,
      [{ id: "consent", prompt: "Share my contact", shares_contact: true }],
      registrations,
    ).split("\r\n");
    expect(lines[0]).toBe(
      "Car,Role,Name,Party size,Instagram,Paid,Email,Phone,Contact detail",
    );
    expect(lines[1]).toBe(
      "Car 1,Driver,Dana Driver,1,d_ig,,d@example.test,555-0100,",
    );
    expect(lines[2]).toBe("Car 1,Passenger,Pat Passenger,2,p_ig,Yes,,,");
    expect(lines[3]).toBe("Car 1,Passenger,Quinn Quiet,1,q_ig,No,,,");
  });
});

test("carpoolsCsvFilename", () => {
  expect(carpoolsCsvFilename("Spring Social!", "2026-10-01")).toBe(
    "spring-social-carpools-2026-10-01.csv",
  );
});
