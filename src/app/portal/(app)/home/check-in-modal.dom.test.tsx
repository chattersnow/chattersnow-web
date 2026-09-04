import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as RegistrantsActions from "../events/registrants-actions";
import * as ImpactDerivedActions from "../events/impact-derived-actions";

// CheckInModal is a thin Sheet wrapper around the real RegistrantsTab (the
// same component the event detail page's Registrants card uses). On the event
// page the phase provider feeds that card; here the modal does, because it
// renders outside the event tabs -- so its job is wiring capacity/mode and the
// two shared reads through, and holding those reads back until the sheet is
// open (the portal home renders one of these per upcoming event). Check-in
// behavior itself is covered in registrants-tab.dom.test.tsx.
const registrantsTabPropsMock = mock((_props: unknown) => null);

mock.module("../events/registrants-tab", () => ({
  RegistrantsTab: (props: { capacity: number | null; mode: string }) => {
    registrantsTabPropsMock(props);
    return <div data-testid="registrants-tab" />;
  },
}));

const listEventRegistrantsActionMock = mock(async () => ({ data: [] }));
const getEventImpactDerivedActionMock = mock(async () => ({ data: null }));

mock.module("../events/registrants-actions", () => ({
  ...RegistrantsActions,
  listEventRegistrantsAction: listEventRegistrantsActionMock,
}));
mock.module("../events/impact-derived-actions", () => ({
  ...ImpactDerivedActions,
  getEventImpactDerivedAction: getEventImpactDerivedActionMock,
}));

const { CheckInModal } = await import("./check-in-modal");

describe("CheckInModal", () => {
  beforeEach(() => {
    registrantsTabPropsMock.mockClear();
    listEventRegistrantsActionMock.mockClear();
    getEventImpactDerivedActionMock.mockClear();
  });

  test("is closed by default and does not mount the registrants panel", () => {
    render(
      <CheckInModal
        eventId="event-1"
        eventName="Winter Gear Giveaway"
        capacity={40}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Check in" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("registrants-tab")).toBeNull();
  });

  test("holds its reads back until the sheet is opened", async () => {
    const user = userEvent.setup();
    render(
      <CheckInModal
        eventId="event-42"
        eventName="Spring Cleanup"
        capacity={null}
      />,
    );

    expect(listEventRegistrantsActionMock).not.toHaveBeenCalled();
    expect(getEventImpactDerivedActionMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Check in" }));

    await waitFor(() => {
      expect(listEventRegistrantsActionMock).toHaveBeenCalledTimes(1);
      expect(getEventImpactDerivedActionMock).toHaveBeenCalledTimes(1);
    });
  });

  test("opens to the event's registrants in edit mode", async () => {
    const user = userEvent.setup();
    render(
      <CheckInModal
        eventId="event-42"
        eventName="Spring Cleanup"
        capacity={null}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Check in" }));

    expect(
      screen.getByRole("heading", { name: "Check in · Spring Cleanup" }),
    ).toBeInTheDocument();
    expect(registrantsTabPropsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ capacity: null, mode: "edit" }),
    );
  });

  test("supports a custom trigger label", () => {
    render(
      <CheckInModal
        eventId="event-1"
        eventName="Winter Gear Giveaway"
        capacity={null}
        triggerLabel="Check in attendees"
      />,
    );

    expect(
      screen.getByRole("button", { name: "Check in attendees" }),
    ).toBeInTheDocument();
  });
});
