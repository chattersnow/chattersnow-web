import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// CheckInModal is a thin Sheet wrapper around the real RegistrantsTab (the
// same component the events list's edit-mode Registrants tab uses); its own
// job is only wiring eventId/capacity/mode/active through and giving it a
// header, so it's tested at that seam rather than re-covering
// RegistrantsTab's own check-in behavior (see registrants-tab.dom.test.tsx).
const registrantsTabPropsMock = mock(
  (_props: {
    eventId: string;
    capacity: number | null;
    active: boolean;
    mode: "view" | "edit";
  }) => null,
);

mock.module("../events/registrants-tab", () => ({
  RegistrantsTab: (props: {
    eventId: string;
    capacity: number | null;
    active: boolean;
    mode: "view" | "edit";
  }) => {
    registrantsTabPropsMock(props);
    return <div data-testid="registrants-tab">{JSON.stringify(props)}</div>;
  },
}));

const { CheckInModal } = await import("./check-in-modal");

describe("CheckInModal", () => {
  beforeEach(() => {
    registrantsTabPropsMock.mockClear();
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

  test("opens to the event's registrants in edit mode, active only while open", async () => {
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
    expect(registrantsTabPropsMock).toHaveBeenLastCalledWith({
      eventId: "event-42",
      capacity: null,
      active: true,
      mode: "edit",
    });
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
