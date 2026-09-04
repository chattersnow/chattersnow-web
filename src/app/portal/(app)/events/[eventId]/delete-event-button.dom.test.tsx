import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CreateEventResult } from "../actions";
import * as EventsActions from "../actions";

const pushMock = mock((_href: string) => {});
const refreshMock = mock(() => {});
const actualNavigation = await import("next/navigation");
mock.module("next/navigation", () => ({
  ...actualNavigation,
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

const deleteEventActionMock = mock<(id: string) => Promise<CreateEventResult>>(
  async () => ({ success: true }),
);
mock.module("../actions", () => ({
  ...EventsActions,
  deleteEventAction: deleteEventActionMock,
}));

const { DeleteEventButton } = await import("./delete-event-button");

function renderButton(blockers: string[] = []) {
  return render(
    <DeleteEventButton
      eventId="event-1"
      eventName="Trailhead Cleanup"
      blockers={blockers}
    />,
  );
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Delete event" }));
  return screen.findByRole("alertdialog");
}

describe("DeleteEventButton", () => {
  beforeEach(() => {
    deleteEventActionMock.mockClear();
    pushMock.mockClear();
    refreshMock.mockClear();
    deleteEventActionMock.mockImplementation(async () => ({ success: true }));
  });

  test("deletes the event after confirming, then returns to the list", async () => {
    const user = userEvent.setup();
    renderButton();

    const dialog = await openDialog(user);
    expect(
      within(dialog).getByText('Delete "Trailhead Cleanup"?'),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(deleteEventActionMock).toHaveBeenCalledTimes(1);
    expect(deleteEventActionMock.mock.calls[0][0]).toBe("event-1");
    expect(pushMock).toHaveBeenCalledWith("/portal/events");
  });

  test("names the blockers and refuses to delete when records are attached", async () => {
    const user = userEvent.setup();
    renderButton(["3 registrants", "1 linked expense"]);

    const dialog = await openDialog(user);
    expect(
      within(dialog).getByText(/3 registrants, 1 linked expense/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Cancelled or Archived/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Delete" }),
    ).toBeDisabled();
    expect(deleteEventActionMock).not.toHaveBeenCalled();
  });

  test("keeps the dialog open and shows the error when the action fails", async () => {
    deleteEventActionMock.mockImplementation(async () => ({
      error: "This event still has linked records (2 sponsors).",
    }));
    const user = userEvent.setup();
    renderButton();

    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(
      await within(dialog).findByText(
        "This event still has linked records (2 sponsors).",
      ),
    ).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
