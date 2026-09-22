import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  EventRegistrant,
  EventRegistrantsData,
} from "./registrants-actions";
import type { EventImpactDerived } from "@/lib/portal/impact-metrics";
import type { TabData } from "@/hooks/use-tab-data";
import { NO_RECORD_MESSAGES } from "@/lib/outbound-messages";

// The #1082 Phase 2 envelope these actions answer with: `message` is the
// display copy the tab is expected to put in front of the operator.
type ActionResult =
  { error: { code: string; message: string } } | { success: true };

const registrants: EventRegistrant[] = [
  {
    id: "reg-1",
    event_id: "event-1",
    name: "Jamie Rivera",
    email: "jamie@example.test",
    phone: null,
    pronouns: null,
    party_size: 2,
    notes: null,
    created_at: "2026-08-01T12:00:00Z",
    person_id: "person-1",
    attended_before: false,
    checked_in_at: null,
    waiver_accepted_at: null,
    waiver_version: null,
    // #685. The row that carries the flag, so the badge has something to
    // render and the other row proves it renders on that one alone.
    party_includes_minor: true,
    // #599. The row that declined, so the "No photos" badge has something to
    // render and the other row proves it renders on that one alone. Declining
    // is the notable state here, which is the inverse of the minors flag above.
    photo_consent: false,
    photo_consent_at: "2026-08-01T12:00:00Z",
    photo_consent_text: "We use photos on our site and socials.",
    minorContacts: {
      accompanying_adult_name: "Robin Rivera",
      accompanying_adult_phone: "555-0101",
      emergency_contact_name: "Sam Rivera",
      emergency_contact_phone: "555-0102",
    },
    rider: {
      riding_discipline_at_event: null,
      ski_experience_level_at_event: null,
      snowboard_experience_level_at_event: null,
      riding_discipline: null,
      ski_experience_level: null,
      snowboard_experience_level: null,
      preferred_mountain: null,
    },
  },
  {
    id: "reg-2",
    event_id: "event-1",
    name: "Alex Chen",
    email: "alex@example.test",
    phone: null,
    pronouns: null,
    party_size: 1,
    notes: null,
    created_at: "2026-08-01T12:05:00Z",
    person_id: "person-2",
    // Unanswered, so the fixture covers all three states across the two rows
    // (#1259) -- and proves the summary's first-timer count does not pick this
    // one up alongside Jamie's "no".
    attended_before: null,
    checked_in_at: "2026-08-28T09:00:00Z",
    waiver_accepted_at: null,
    waiver_version: null,
    party_includes_minor: false,
    // Granted, which renders nothing: the badge is for the decline, and
    // "agreed" on every other row would be noise at the door (#599).
    photo_consent: true,
    photo_consent_at: "2026-08-01T12:05:00Z",
    photo_consent_text: "We use photos on our site and socials.",
    minorContacts: null,
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
];

const derivedFigures: EventImpactDerived = {
  participants: 1,
  checkedIn: 1,
  firstTimeParticipants: 1,
  recurringParticipants: 0,
  volunteerParticipants: 0,
  beginnerParticipants: null,
  profiledAttendees: null,
  discountCodesAssigned: null,
  autoAssignDiscountCodes: false,
};

// The detail sheet's messaging island imports its Server Actions, and through
// them the `server-only` sender (#1317). Next's bundler replaces that module
// with action references for a client component; under bun it is imported for
// real -- and a static import of the action module would evaluate it before
// this line runs, so the module below is pulled in dynamically.
mock.module("server-only", () => ({}));
const RegistrantsActions = await import("./registrants-actions");

const checkInRegistrantActionMock = mock<(id: string) => Promise<ActionResult>>(
  async () => ({ success: true }),
);
const undoCheckInActionMock = mock<(id: string) => Promise<ActionResult>>(
  async () => ({ success: true }),
);

mock.module("./registrants-actions", () => ({
  ...RegistrantsActions,
  checkInRegistrantAction: checkInRegistrantActionMock,
  undoCheckInAction: undoCheckInActionMock,
}));

const toastErrorMock = mock<(message: string) => string>(() => "");
const toastSuccessMock = mock<(message: string) => string>(() => "");

mock.module("@/components/ui/toast", () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
    close: mock(() => {}),
  },
  Toaster: () => null,
}));

const { RegistrantsTab } = await import("./registrants-tab");

// The card no longer fetches -- the phase provider does (event-shared-data.tsx)
// -- so the tests hand it the same slices the provider would.
const refreshRegistrants = mock(() => {});
const refreshDerived = mock(() => {});

/**
 * The payload listEventRegistrantsAction() answers with (#1317): the rows, the
 * history behind them, and the composer's context. `messaging` is null here by
 * default, which is what an `events: view` reader gets -- the cases that need
 * the messaging half pass their own.
 */
function payload(
  overrides: Partial<EventRegistrantsData> = {},
): EventRegistrantsData {
  return {
    registrants,
    messages: NO_RECORD_MESSAGES,
    messaging: null,
    waiverInForce: false,
    photoConsentInForce: false,
    ...overrides,
  };
}

function slices(): {
  eventId: string;
  eventName: string;
  registrants: TabData<EventRegistrantsData>;
  derived: TabData<EventImpactDerived>;
} {
  return {
    eventId: "event-1",
    eventName: "Mountain Day",
    registrants: {
      data: payload(),
      loadError: null,
      refresh: refreshRegistrants,
    },
    derived: {
      data: derivedFigures,
      loadError: null,
      refresh: refreshDerived,
    },
  };
}

describe("RegistrantsTab", () => {
  beforeEach(() => {
    checkInRegistrantActionMock.mockClear();
    checkInRegistrantActionMock.mockResolvedValue({ success: true });
    undoCheckInActionMock.mockClear();
    undoCheckInActionMock.mockResolvedValue({ success: true });
    toastErrorMock.mockClear();
    toastSuccessMock.mockClear();
    refreshRegistrants.mockClear();
    refreshDerived.mockClear();
  });

  test("displays registrants with summary counts", async () => {
    render(<RegistrantsTab capacity={10} mode="view" {...slices()} />);

    expect(await screen.findByText("Jamie Rivera")).toBeInTheDocument();
    expect(screen.getByText("Alex Chen")).toBeInTheDocument();
    // Two first-time figures, side by side and worded apart (#1259). "1
    // first-time" is derived from check-ins and is the one impact reporting
    // uses; "1 said it would be their first" is what a registrant told us. They
    // agree here by coincidence -- Alex checked in and had never been, Jamie
    // said no and has not turned up -- and nothing merges them.
    expect(
      await screen.findByText(
        "2 registrations, 3 attending of 10 capacity · 1 checked in · 0 recurring, 1 first-time · 1 said it would be their first",
      ),
    ).toBeInTheDocument();
  });

  test("Rides shows the level snapshotted at check-in, not the current profile", async () => {
    render(<RegistrantsTab capacity={null} mode="view" {...slices()} />);
    await screen.findByText("Alex Chen");

    // Alex now rides both at advanced, but was a snowboard beginner on the day.
    expect(screen.getByText("Snowboard · Beginner")).toBeInTheDocument();
    expect(screen.queryByText(/Both/)).toBeNull();
  });

  test("view mode hides check-in controls", async () => {
    render(<RegistrantsTab capacity={null} mode="view" {...slices()} />);
    await screen.findByText("Jamie Rivera");

    expect(screen.queryByRole("button", { name: "Check in" })).toBeNull();
  });

  test("checks in a registrant and shows undo for an already checked-in one", async () => {
    const user = userEvent.setup();
    render(<RegistrantsTab capacity={null} mode="edit" {...slices()} />);
    await screen.findByText("Jamie Rivera");

    expect(
      screen.getByRole("button", { name: "Undo check-in" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Check in" }));

    expect(checkInRegistrantActionMock).toHaveBeenCalledWith("reg-1");
    // Checking someone in changes the derived figures too, so both shared
    // reads have to be refreshed, not just the registrant list.
    expect(refreshRegistrants).toHaveBeenCalled();
    expect(refreshDerived).toHaveBeenCalled();
  });

  test("undoing a check-in calls undoCheckInAction", async () => {
    const user = userEvent.setup();
    render(<RegistrantsTab capacity={null} mode="edit" {...slices()} />);
    await screen.findByText("Alex Chen");

    await user.click(screen.getByRole("button", { name: "Undo check-in" }));

    expect(undoCheckInActionMock).toHaveBeenCalledWith("reg-2");
  });

  // The door's failure mode: an expired session or an account without
  // `events: manage` leaves the row unchanged, so the refusal has to be said
  // out loud instead of being swallowed by a refresh (#1124).
  test("a refused check-in shows the action's message and skips the refresh", async () => {
    checkInRegistrantActionMock.mockResolvedValue({
      error: {
        code: "forbidden",
        message: "You do not have permission to manage events.",
      },
    });
    const user = userEvent.setup();
    render(<RegistrantsTab capacity={null} mode="edit" {...slices()} />);
    await screen.findByText("Jamie Rivera");

    await user.click(screen.getByRole("button", { name: "Check in" }));

    expect(toastErrorMock).toHaveBeenCalledWith(
      "You do not have permission to manage events.",
    );
    expect(refreshRegistrants).not.toHaveBeenCalled();
    expect(refreshDerived).not.toHaveBeenCalled();
  });

  test("a refused undo shows the action's message", async () => {
    undoCheckInActionMock.mockResolvedValue({
      error: {
        code: "unauthenticated",
        message: "You must be signed in to undo a check-in.",
      },
    });
    const user = userEvent.setup();
    render(<RegistrantsTab capacity={null} mode="edit" {...slices()} />);
    await screen.findByText("Alex Chen");

    await user.click(screen.getByRole("button", { name: "Undo check-in" }));

    expect(toastErrorMock).toHaveBeenCalledWith(
      "You must be signed in to undo a check-in.",
    );
    expect(refreshRegistrants).not.toHaveBeenCalled();
  });

  test("a successful check-in leaves a receipt naming the registrant", async () => {
    const user = userEvent.setup();
    render(<RegistrantsTab capacity={null} mode="edit" {...slices()} />);
    await screen.findByText("Jamie Rivera");

    await user.click(screen.getByRole("button", { name: "Check in" }));

    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Jamie Rivera checked in.",
      expect.anything(),
    );
  });
  test("caps the card at previewRows and defers the rest to a sheet", async () => {
    render(
      <RegistrantsTab
        capacity={null}
        mode="edit"
        previewRows={1}
        {...slices()}
      />,
    );

    expect(await screen.findByText("Jamie Rivera")).toBeInTheDocument();
    expect(screen.queryByText("Alex Chen")).toBeNull();
    expect(
      screen.getByRole("button", { name: "View all 2 registrants" }),
    ).toBeInTheDocument();
  });

  test("no View all trigger when the list already fits", async () => {
    render(<RegistrantsTab capacity={null} mode="edit" {...slices()} />);
    await screen.findByText("Jamie Rivera");

    expect(screen.queryByRole("button", { name: /View all/ })).toBeNull();
  });

  test("previewRows null renders the whole list with no trigger", async () => {
    // What the Happening Now check-in sheet passes: capping there would hide
    // the rows it exists to work through, and the trigger would open a sheet
    // on top of a sheet.
    render(
      <RegistrantsTab
        capacity={null}
        mode="edit"
        previewRows={null}
        {...slices()}
      />,
    );

    expect(await screen.findByText("Jamie Rivera")).toBeInTheDocument();
    expect(screen.getByText("Alex Chen")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /View all/ })).toBeNull();
  });

  test("the sheet lists every registrant and carries the toolbar actions", async () => {
    const user = userEvent.setup();
    render(
      <RegistrantsTab
        capacity={null}
        mode="edit"
        previewRows={1}
        headerActions={<button type="button">+ Add registrant</button>}
        {...slices()}
      />,
    );
    await screen.findByText("Jamie Rivera");

    await user.click(
      screen.getByRole("button", { name: "View all 2 registrants" }),
    );

    const sheet = within(await screen.findByRole("dialog"));
    expect(sheet.getByText("Jamie Rivera")).toBeInTheDocument();
    expect(sheet.getByText("Alex Chen")).toBeInTheDocument();
    expect(
      sheet.getByRole("button", { name: "+ Add registrant" }),
    ).toBeInTheDocument();
  });

  test("searching inside the sheet narrows rows and announces the count", async () => {
    const user = userEvent.setup();
    render(
      <RegistrantsTab
        capacity={null}
        mode="edit"
        previewRows={1}
        {...slices()}
      />,
    );
    await screen.findByText("Jamie Rivera");
    await user.click(
      screen.getByRole("button", { name: "View all 2 registrants" }),
    );

    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByRole("searchbox", { name: "Search registrants" }),
      "alex@",
    );

    expect(within(dialog).getByText("Alex Chen")).toBeInTheDocument();
    expect(within(dialog).queryByText("Jamie Rivera")).toBeNull();
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "Showing 1 of 2",
    );
  });

  test("checks in from inside the sheet without closing it", async () => {
    const user = userEvent.setup();
    render(
      <RegistrantsTab
        capacity={null}
        mode="edit"
        previewRows={1}
        {...slices()}
      />,
    );
    await screen.findByText("Jamie Rivera");
    await user.click(
      screen.getByRole("button", { name: "View all 2 registrants" }),
    );

    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Undo check-in" }),
    );

    expect(undoCheckInActionMock).toHaveBeenCalledWith("reg-2");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  // #1259
  test("names the been-before answer per row, and an unanswered one as a dash", async () => {
    render(<RegistrantsTab capacity={10} mode="view" {...slices()} />);

    const jamie = (await screen.findByText("Jamie Rivera")).closest("tr")!;
    expect(within(jamie).getByText("First time")).toBeInTheDocument();

    // Alex never answered. A dash, and emphatically not "First time": the
    // difference between "said no" and "was never asked" is the difference
    // between a fact and an assumption.
    const alex = screen.getByText("Alex Chen").closest("tr")!;
    expect(within(alex).getByText("—")).toBeInTheDocument();
    expect(within(alex).queryByText("First time")).toBeNull();
  });

  test("hides the column and the count on an event where nobody was asked", async () => {
    const unasked = registrants.map((registrant) => ({
      ...registrant,
      attended_before: null,
    }));

    render(
      <RegistrantsTab
        capacity={10}
        mode="view"
        {...slices()}
        registrants={{
          data: payload({ registrants: unasked }),
          loadError: null,
          refresh: refreshRegistrants,
        }}
      />,
    );

    expect(await screen.findByText("Jamie Rivera")).toBeInTheDocument();
    expect(screen.queryByText("Been before")).toBeNull();
    // The derived figure is still there; only the self-reported one goes.
    expect(
      screen.getByText(
        "2 registrations, 3 attending of 10 capacity · 1 checked in · 0 recurring, 1 first-time",
      ),
    ).toBeInTheDocument();
  });

  // #685. Beside the name, on the row that said yes and no other. An organizer
  // has to see it before the day rather than at the door, which is why it is
  // not behind the detail sheet and not behind `events: manage`.
  test("flags the party that includes a minor, and only that one", async () => {
    render(<RegistrantsTab capacity={10} mode="view" {...slices()} />);

    expect(await screen.findByText("Jamie Rivera")).toBeInTheDocument();
    expect(screen.getAllByText("Includes a minor")).toHaveLength(1);
  });

  test("says nothing when nobody answered yes", async () => {
    const noMinors = registrants.map((registrant) => ({
      ...registrant,
      party_includes_minor:
        registrant.party_includes_minor === true ? null : false,
      minorContacts: null,
    }));

    render(
      <RegistrantsTab
        capacity={10}
        mode="view"
        {...slices()}
        registrants={{
          data: payload({ registrants: noMinors }),
          loadError: null,
          refresh: refreshRegistrants,
        }}
      />,
    );

    expect(await screen.findByText("Jamie Rivera")).toBeInTheDocument();
    expect(screen.queryByText("Includes a minor")).toBeNull();
  });

  // #599, and the condition is the inverse of the minors flag above: the state
  // a camera has to know about is the `false`. This is also the check-in
  // surface, because `check-in-modal.tsx` renders this same table.
  //
  // **This block is deliberately unchanged by #1376 and is the regression
  // guard for the operational point.** The semantics of the column flipped
  // around it -- `false` stopped meaning "asked and declined" and started
  // meaning "objected" -- and nothing here had to move, because `false` has
  // always meant the one thing a door shift acts on. This badge is also why
  // the columns survived the reversal at all: dropping them would have
  // deleted the list somebody checks before pointing a camera, and "photos
  // can be deleted" is a remedy after the fact rather than that list. If a
  // future change makes these assertions need editing, the operational
  // meaning of `false` has moved and that is the thing to question first.
  test("flags the registrant who declined photos, and only that one", async () => {
    render(<RegistrantsTab capacity={10} mode="view" {...slices()} />);

    expect(await screen.findByText("Jamie Rivera")).toBeInTheDocument();
    expect(screen.getAllByText("No photos")).toHaveLength(1);
  });

  test("says nothing about photos when nobody declined", async () => {
    // One granted, one never asked: the two states that must both stay silent.
    // A badge on "agreed" would be noise on most rows, and a badge on "not
    // asked" would put a gap in the organization's own configuration in front
    // of the door shift.
    const noDeclines = registrants.map((registrant, index) => ({
      ...registrant,
      photo_consent: index === 0 ? true : null,
      photo_consent_at: index === 0 ? registrant.photo_consent_at : null,
      photo_consent_text: index === 0 ? registrant.photo_consent_text : null,
    }));

    render(
      <RegistrantsTab
        capacity={10}
        mode="view"
        {...slices()}
        registrants={{
          data: payload({ registrants: noDeclines }),
          loadError: null,
          refresh: refreshRegistrants,
        }}
      />,
    );

    expect(await screen.findByText("Jamie Rivera")).toBeInTheDocument();
    expect(screen.queryByText("No photos")).toBeNull();
  });
});
