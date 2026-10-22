/**
 * "Download carpools (CSV)" (#1649), as a pure function so what lands in the
 * file can be tested without a database. The route handler beside the board
 * does the reading and the permission check.
 *
 * One row per person in a car, the driver first: car, role, name, party size,
 * Instagram handle and, for a passenger, whether they have paid their driver.
 * Email, phone and the preferred contact detail follow the answers export's
 * consent rule (#1501, #1647): the columns exist only where the event has a
 * `shares_contact` question, and are filled only on the rows that ticked it.
 */

import type { CarpoolCar } from "@/lib/event-carpools";
import {
  csvField,
  registrantAnswersCsvFilename,
  sharesContact,
  type AnswersCsvQuestion,
  type AnswersCsvRegistration,
} from "./registrant-answers-csv";

export type CarpoolsCsvRegistration = Pick<
  AnswersCsvRegistration,
  | "email"
  | "phone"
  | "instagram_handle"
  | "preferred_contact_detail"
  | "answers"
> & { id: string };

export function carpoolsCsv(
  cars: readonly CarpoolCar[],
  questions: readonly AnswersCsvQuestion[],
  registrations: readonly CarpoolsCsvRegistration[],
): string {
  const withContact = questions.some((question) => question.shares_contact);
  const byId = new Map(registrations.map((row) => [row.id, row]));
  const header = [
    "Car",
    "Role",
    "Name",
    "Party size",
    "Instagram",
    "Paid",
    ...(withContact ? ["Email", "Phone", "Contact detail"] : []),
  ];

  const rows = cars.flatMap((car) => {
    const people = [
      ...(car.driver
        ? [{ person: car.driver, role: "Driver", paid: null as string | null }]
        : []),
      ...car.passengers.map((passenger) => ({
        person: passenger,
        role: "Passenger",
        paid: passenger.paidAt ? "Yes" : "No",
      })),
    ];
    return people.map(({ person, role, paid }) => {
      const registration = byId.get(person.registrationId);
      const shares =
        withContact &&
        registration !== undefined &&
        sharesContact(questions, {
          name: person.name,
          party_size: person.partySize,
          ...registration,
        });
      return [
        car.label,
        role,
        person.name,
        person.partySize,
        registration?.instagram_handle || null,
        paid,
        ...(withContact
          ? [
              shares ? registration?.email || null : null,
              shares ? registration?.phone || null : null,
              shares ? registration?.preferred_contact_detail || null : null,
            ]
          : []),
      ];
    });
  });

  return [header, ...rows]
    .map((row) => row.map(csvField).join(","))
    .join("\r\n")
    .concat("\r\n");
}

/** `spring-social-carpools-2026-10-01.csv`. */
export function carpoolsCsvFilename(eventName: string, date: string): string {
  return registrantAnswersCsvFilename(eventName, date).replace(
    /-answers-(\d{4}-\d{2}-\d{2})\.csv$/,
    "-carpools-$1.csv",
  );
}
