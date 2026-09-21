// #1317: the registrant detail sheet, and the line between what door staff see
// and what an organizer sees. There was no registrant detail surface before
// this, and the sheet is now the one place rider data and the message composer
// sit side by side -- so the gate on each half is what this file is about.
import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import type { EventRegistrant } from "./registrants-actions";
import { RegistrantDetailSheet } from "./registrant-detail-sheet";

const REGISTRANT: EventRegistrant = {
  id: "11111111-1111-4111-8111-111111111111",
  event_id: "22222222-2222-4222-8222-222222222222",
  name: "Jamie Rivera",
  email: "jamie@example.test",
  phone: "555-0100",
  pronouns: "they/them",
  party_size: 3,
  notes: "Bringing a friend who skis.",
  created_at: "2026-08-01T12:00:00.000Z",
  person_id: "33333333-3333-4333-8333-333333333333",
  checked_in_at: null,
  attended_before: false,
  rider: null,
};

function renderSheet(
  overrides: {
    registrant?: Partial<EventRegistrant>;
    canManage?: boolean;
    orgEmailEnabled?: boolean;
  } = {},
) {
  render(
    <RegistrantDetailSheet
      registrant={{ ...REGISTRANT, ...overrides.registrant }}
      eventName="Mountain Day"
      messages={[]}
      messageActors={[]}
      orgName="Chatter Snow"
      replyTo="hello@chattersnow.org"
      orgEmailEnabled={overrides.orgEmailEnabled ?? true}
      canManage={overrides.canManage ?? true}
      onClosed={() => {}}
    />,
  );
}

describe("RegistrantDetailSheet", () => {
  test("carries the registration, not just the name on the row", () => {
    renderSheet();

    expect(screen.getByText("Jamie Rivera")).toBeInTheDocument();
    expect(screen.getByText("they/them")).toBeInTheDocument();
    expect(screen.getByText("jamie@example.test")).toBeInTheDocument();
    expect(screen.getByText("555-0100")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Bringing a friend who skis.")).toBeInTheDocument();
    expect(screen.getByText("Not yet")).toBeInTheDocument();
  });

  test("an organizer gets the composer and the history", () => {
    renderSheet();

    expect(
      screen.getByRole("button", { name: "Contact registrant" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /Resend confirmation/ }),
    ).toBeEnabled();
    expect(screen.getByText("Messages")).toBeInTheDocument();
  });

  test("door staff see the registration and none of the messaging", () => {
    // `events: view` works the door and has to read a party size or a note;
    // writing to the person on the organization's letterhead is a different
    // thing, and the whole section is absent rather than disabled.
    renderSheet({ canManage: false });

    expect(screen.getByText("Jamie Rivera")).toBeInTheDocument();
    expect(screen.queryByText("Messages")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Contact registrant" }),
    ).toBeNull();
  });

  test("an anonymized registration disables the controls and says why", () => {
    // What run_retention_purge's rule C leaves behind. Disabled and explained,
    // not hidden: "there is nobody to write to" and "email is off for the
    // organization" look identical from an absent button, and the difference
    // is what decides whether anything can be done about it.
    renderSheet({
      registrant: { name: "Removed", email: "", person_id: null },
    });

    expect(
      screen.getByRole("button", { name: "Contact registrant" }),
    ).toBeDisabled();
    expect(
      screen.getByText("This registration has no email address to write to."),
    ).toBeInTheDocument();
  });

  test("the organization's switch being off is its own sentence", () => {
    renderSheet({ orgEmailEnabled: false });

    expect(
      screen.getByRole("button", { name: "Contact registrant" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Outbound email is switched off for this organization."),
    ).toBeInTheDocument();
  });

  test("rider data appears only when the list handed it over", () => {
    // `rider` comes back null from listEventRegistrantsAction() for a viewer
    // who is not cleared for it, so this sheet cannot become a second place it
    // leaks from -- the gate is upstream and this only honours it.
    renderSheet();
    expect(screen.queryByText("Rides")).toBeNull();

    renderSheet({
      registrant: {
        rider: {
          riding_discipline_at_event: "snowboard",
          ski_experience_level_at_event: null,
          snowboard_experience_level_at_event: "beginner",
          riding_discipline: "both",
          ski_experience_level: "advanced",
          snowboard_experience_level: "advanced",
          preferred_mountain: "Hunter",
        },
      },
    });
    expect(screen.getAllByText("Rides").length).toBeGreaterThan(0);
    expect(screen.getByText("Prefers Hunter")).toBeInTheDocument();
  });
});
