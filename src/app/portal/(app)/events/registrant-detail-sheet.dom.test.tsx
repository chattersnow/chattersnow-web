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
  waiver_accepted_at: null,
  waiver_version: null,
  party_includes_minor: null,
  adults_only_confirmed_at: null,
  photo_consent: null,
  photo_consent_at: null,
  photo_consent_text: null,
  option_counts: [],
  rider: null,
  minorContacts: null,
};

function renderSheet(
  overrides: {
    registrant?: Partial<EventRegistrant>;
    canManage?: boolean;
    orgEmailEnabled?: boolean;
    waiverInForce?: boolean;
    photoConsentInForce?: boolean;
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
      waiverInForce={overrides.waiverInForce ?? false}
      photoConsentInForce={overrides.photoConsentInForce ?? false}
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

  // #686. Three states, and the difference between the last two is the whole
  // reason `waiverInForce` is read at all.
  test("says nothing about an agreement on a tenant that takes none", () => {
    renderSheet();

    expect(screen.queryByText("Agreement")).toBeNull();
  });

  test("shows the accepted version, linking that exact one", () => {
    renderSheet({
      registrant: {
        waiver_accepted_at: "2026-09-01T12:00:00Z",
        waiver_version: 4,
      },
      waiverInForce: true,
    });

    expect(screen.getAllByText("Agreement").length).toBeGreaterThan(0);
    expect(screen.getByText(/Accepted version 4 on/)).toBeInTheDocument();
    // The permalink is why the column stores a version rather than a copy of
    // the text: somebody reading this during a dispute reaches the exact
    // words without asking anybody.
    expect(
      screen.getByRole("link", { name: "Read that version" }),
    ).toHaveAttribute("href", "/waiver?version=4");
  });

  // Not an em dash, and not "declined": declining is not submitting, so a
  // refusal leaves no registration for this sheet to open.
  test("an older registration says no agreement was in force, not that they refused", () => {
    renderSheet({ waiverInForce: true });

    expect(
      screen.getByText(/no agreement was in force when they registered/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/declin/i)).toBeNull();
  });

  // Withdrawing the agreement must not erase the record of who accepted it.
  test("keeps the row for a registration that carries one after it is withdrawn", () => {
    renderSheet({
      registrant: {
        waiver_accepted_at: "2026-09-01T12:00:00Z",
        waiver_version: 4,
      },
      waiverInForce: false,
    });

    expect(screen.getByText(/Accepted version 4 on/)).toBeInTheDocument();
  });

  // #685. The split the ticket is about: the fact is for everybody who can
  // open the sheet, the two contacts are not — and they are absent because the
  // database refused them, not because this component declined to ask.
  test("says nothing about minors for a party that has none", () => {
    renderSheet({ registrant: { party_includes_minor: false } });
    expect(screen.queryByText("Under 18 in the party")).toBeNull();

    renderSheet({ registrant: { party_includes_minor: null } });
    expect(screen.queryByText("Under 18 in the party")).toBeNull();
  });

  test("an organizer sees the accompanying adult and the emergency contact", () => {
    renderSheet({
      registrant: {
        party_includes_minor: true,
        minorContacts: {
          accompanying_adult_name: "Robin Rivera",
          accompanying_adult_phone: "555-0101",
          emergency_contact_name: "Sam Rivera",
          emergency_contact_phone: "555-0102",
        },
      },
    });

    expect(screen.getByText("Under 18 in the party")).toBeInTheDocument();
    expect(screen.getByText(/Robin Rivera · 555-0101/)).toBeInTheDocument();
    expect(screen.getByText(/Sam Rivera · 555-0102/)).toBeInTheDocument();
  });

  test("a door shift sees the flag and neither contact", () => {
    renderSheet({
      canManage: false,
      registrant: { party_includes_minor: true, minorContacts: null },
    });

    expect(screen.getByText("Under 18 in the party")).toBeInTheDocument();
    expect(screen.queryByText("Accompanying adult")).toBeNull();
    expect(screen.queryByText("Emergency contact")).toBeNull();
  });

  // #599, reversed by #1376: the columns hold an objection now. The contrast
  // with the waiver block above is still the point -- that one can never say
  // "they said no", and this one has to.
  describe("photos and video", () => {
    test("says nothing on an organization that publishes no photo notice", () => {
      renderSheet();
      expect(screen.queryByText("Photos")).toBeNull();
    });

    test("an objection is stated as an instruction, not as an absence", () => {
      renderSheet({
        photoConsentInForce: true,
        registrant: {
          photo_consent: false,
          photo_consent_at: "2026-08-01T12:00:00.000Z",
          photo_consent_text: "We use photos on our site and socials.",
        },
      });

      expect(screen.getByText("Photos")).toBeInTheDocument();
      expect(
        screen.getByText(/Asked not to be photographed or recorded/),
      ).toBeInTheDocument();
    });

    test("a withdrawal says so, and neither state is an em dash", () => {
      renderSheet({
        photoConsentInForce: true,
        registrant: {
          photo_consent: true,
          photo_consent_at: "2026-08-01T12:00:00.000Z",
          photo_consent_text: "We use photos on our site and socials.",
        },
      });

      expect(
        screen.getByText(/Confirmed they are happy to be photographed/),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Asked not to be/)).toBeNull();
    });

    // The resting state of every registration this platform takes (#1376).
    // It is a fact about the record, said plainly, and it may never read as
    // an objection -- nor as a gap in the organization's configuration.
    test("no objection on record is stated as that, not as an absence", () => {
      renderSheet({
        photoConsentInForce: true,
        registrant: { photo_consent: null },
      });

      expect(screen.getByText("Photos")).toBeInTheDocument();
      expect(screen.getByText("No objection recorded")).toBeInTheDocument();
      expect(screen.queryByText(/Asked not to be/)).toBeNull();
      expect(screen.queryByText(/Confirmed/)).toBeNull();
    });

    // Kept for a row that carries an objection even after the organization
    // takes its notice down, the same way the agreement row is.
    test("an objection survives the organization withdrawing its notice", () => {
      renderSheet({
        photoConsentInForce: false,
        registrant: {
          photo_consent: false,
          photo_consent_at: "2026-08-01T12:00:00.000Z",
          photo_consent_text: "We use photos on our site and socials.",
        },
      });

      expect(
        screen.getByText(/Asked not to be photographed or recorded/),
      ).toBeInTheDocument();
    });

    // The snapshot is the only place the words can be reached: a content slot
    // has no version table and no permalink, unlike the waiver.
    test("the paragraphs on the row are reachable, and there is no permalink", () => {
      renderSheet({
        photoConsentInForce: true,
        registrant: {
          photo_consent: true,
          photo_consent_at: "2026-08-01T12:00:00.000Z",
          photo_consent_text: "We use photos on our site and socials.",
        },
      });

      expect(screen.getByText("What they were asked")).toBeInTheDocument();
      expect(
        screen.getByText("We use photos on our site and socials."),
      ).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /photo/i })).toBeNull();
    });
  });
});
