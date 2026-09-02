import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CreateEventResult } from "./actions";
import * as EventActions from "./actions";

const createEventActionMock = mock<
  (formData: FormData) => Promise<CreateEventResult>
>(async () => ({ success: true }));

mock.module("./actions", () => ({
  ...EventActions,
  createEventAction: createEventActionMock,
}));

const { NewEventDialog } = await import("./new-event-dialog");

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  render(<NewEventDialog />);
  await user.click(screen.getByRole("button", { name: "New Event" }));
}

describe("NewEventDialog", () => {
  beforeEach(() => {
    createEventActionMock.mockClear();
    createEventActionMock.mockImplementation(async () => ({ success: true }));
  });

  test("defaults visibility to private and status to draft", async () => {
    const user = userEvent.setup();
    await openDialog(user);

    expect(screen.getByLabelText("Visibility")).toHaveTextContent("Private");
    expect(screen.getByLabelText("Status")).toHaveTextContent("Draft");
  });

  test("prefills the timezone from the browser's resolved timezone", async () => {
    const user = userEvent.setup();
    await openDialog(user);

    expect(screen.getByLabelText("Timezone")).toHaveValue(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
  });

  test("submits the form and closes on success", async () => {
    const user = userEvent.setup();
    await openDialog(user);

    await user.type(screen.getByLabelText("Event name"), "Winter Fest");
    await user.type(screen.getByLabelText("Starts"), "2026-12-01T10:00");
    await user.click(screen.getByRole("button", { name: "Create event" }));

    await screen.findByRole("button", { name: "New Event" });
    expect(createEventActionMock).toHaveBeenCalledTimes(1);

    const submitted = createEventActionMock.mock.calls[0][0];
    expect(submitted.get("name")).toBe("Winter Fest");
    expect(submitted.get("visibility")).toBe("private");
    expect(submitted.get("status")).toBe("draft");
  });

  test("shows the server error and keeps the dialog open on failure", async () => {
    createEventActionMock.mockImplementation(async () => ({
      error: "Could not create the event. Please try again.",
    }));
    const user = userEvent.setup();
    await openDialog(user);

    await user.type(screen.getByLabelText("Event name"), "Winter Fest");
    await user.type(screen.getByLabelText("Starts"), "2026-12-01T10:00");
    await user.click(screen.getByRole("button", { name: "Create event" }));

    expect(
      await screen.findByText("Could not create the event. Please try again."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Event name")).toHaveValue("Winter Fest");
  });

  test("resets the form after closing and reopening", async () => {
    const user = userEvent.setup();
    await openDialog(user);

    await user.type(screen.getByLabelText("Event name"), "Draft event");
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "New Event" }));
    expect(screen.getByLabelText("Event name")).toHaveValue("");
  });
});
