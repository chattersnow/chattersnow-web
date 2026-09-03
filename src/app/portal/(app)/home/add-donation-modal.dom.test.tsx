import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CreateDonationInput } from "./donation-form";
import * as HomeActions from "./actions";

type CreateDonationResult = { error: string } | { success: true };

const createDonationActionMock = mock<
  (input: CreateDonationInput) => Promise<CreateDonationResult>
>(async () => ({ success: true }));

mock.module("./actions", () => ({
  ...HomeActions,
  createDonationAction: createDonationActionMock,
}));

// The sheet loads event options on open whenever a caller passes neither an
// events list nor a fixed eventId.
mock.module("../events/actions", () => ({
  listEventOptionsAction: async () => ({ data: [] }),
}));

const { AddDonationModal } = await import("./add-donation-modal");

async function openModal(user: ReturnType<typeof userEvent.setup>) {
  render(<AddDonationModal />);
  await user.click(screen.getByRole("button", { name: "Record donation" }));
}

async function selectSourceType(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
) {
  await user.click(screen.getByLabelText("Donor source"));
  const listbox = await screen.findByRole("listbox");
  await user.click(within(listbox).getByText(label));
}

async function fillDonorAndContinue(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  await user.type(screen.getByLabelText("Donor name"), name);
  await selectSourceType(user, "Individual");
  await user.click(screen.getByRole("button", { name: "Continue" }));
}

describe("AddDonationModal", () => {
  beforeEach(() => {
    createDonationActionMock.mockClear();
    createDonationActionMock.mockImplementation(async () => ({
      success: true,
    }));
  });

  test("blocks continuing without a donor name", async () => {
    const user = userEvent.setup();
    await openModal(user);

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      screen.getByText(
        "Donor name is required unless the donation is anonymous.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Step 2 of 2/)).not.toBeInTheDocument();
  });

  test("allows an empty donor name when anonymous", async () => {
    const user = userEvent.setup();
    await openModal(user);

    await user.click(screen.getByRole("checkbox", { name: "Anonymous donor" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      screen.queryByText(
        "Donor name is required unless the donation is anonymous.",
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Select a donor source.")).toBeInTheDocument();
  });

  test("blocks continuing without a donor source", async () => {
    const user = userEvent.setup();
    await openModal(user);

    await user.type(screen.getByLabelText("Donor name"), "Jane Donor");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Select a donor source.")).toBeInTheDocument();
  });

  test("advances to the items step once donor details are valid", async () => {
    const user = userEvent.setup();
    await openModal(user);

    await fillDonorAndContinue(user, "Jane Donor");

    expect(screen.getByText("Step 2 of 2 · Donated items")).toBeInTheDocument();
    expect(screen.getByText("Item 1")).toBeInTheDocument();
  });

  test("adding and removing items keeps at least one item", async () => {
    const user = userEvent.setup();
    await openModal(user);
    await fillDonorAndContinue(user, "Jane Donor");

    expect(screen.getAllByRole("button", { name: "Remove" })[0]).toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: "+ Add another item" }),
    );
    expect(screen.getByText("Item 2")).toBeInTheDocument();
    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    expect(removeButtons[0]).not.toBeDisabled();

    await user.click(removeButtons[0]);
    expect(screen.queryByText("Item 2")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
  });

  test("submits the donation and maps blank optional item fields to undefined", async () => {
    const user = userEvent.setup();
    await openModal(user);
    await fillDonorAndContinue(user, "Jane Donor");

    await user.type(screen.getByLabelText("Item description"), "Winter jacket");
    await user.type(screen.getByLabelText("Item type"), "Jacket");
    await user.click(screen.getByRole("button", { name: "Save donation" }));

    await screen.findByRole("button", { name: "Record donation" });
    expect(createDonationActionMock).toHaveBeenCalledTimes(1);

    const payload = createDonationActionMock.mock.calls[0][0];
    expect(payload.donorName).toBe("Jane Donor");
    expect(payload.sourceType).toBe("individual");
    expect(payload.items).toEqual([
      {
        description: "Winter jacket",
        size: undefined,
        type: "Jacket",
        gender: undefined,
        condition: "",
        faceValue: null,
        notes: undefined,
      },
    ]);
  });

  test("shows the server error and stays open on failure", async () => {
    createDonationActionMock.mockImplementation(async () => ({
      error: "Could not save the donation. Please try again.",
    }));
    const user = userEvent.setup();
    await openModal(user);
    await fillDonorAndContinue(user, "Jane Donor");

    await user.type(screen.getByLabelText("Item description"), "Winter jacket");
    await user.type(screen.getByLabelText("Item type"), "Jacket");
    await user.click(screen.getByRole("button", { name: "Save donation" }));

    expect(
      await screen.findByText("Could not save the donation. Please try again."),
    ).toBeInTheDocument();
    expect(screen.getByText("Step 2 of 2 · Donated items")).toBeInTheDocument();
  });

  test("hides the source event picker when no events are provided", async () => {
    const user = userEvent.setup();
    await openModal(user);

    expect(screen.queryByLabelText("Source event (optional)")).toBeNull();
  });

  test("hides the source event picker when a fixed eventId is given", async () => {
    const user = userEvent.setup();
    render(
      <AddDonationModal
        eventId="event-1"
        events={[{ id: "event-1", name: "Winter Gear Drive" }]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Record donation" }));

    expect(screen.queryByLabelText("Source event (optional)")).toBeNull();
  });

  test("submits the selected source event when no fixed eventId is given", async () => {
    const user = userEvent.setup();
    render(
      <AddDonationModal
        events={[
          { id: "event-1", name: "Winter Gear Drive" },
          { id: "event-2", name: "Spring Cleanup" },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Record donation" }));
    await fillDonorAndContinue(user, "Jane Donor");

    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByLabelText("Source event (optional)"));
    const listbox = await screen.findByRole("listbox");
    await user.click(within(listbox).getByText("Spring Cleanup"));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await user.type(screen.getByLabelText("Item description"), "Winter jacket");
    await user.type(screen.getByLabelText("Item type"), "Jacket");
    await user.click(screen.getByRole("button", { name: "Save donation" }));

    await screen.findByRole("button", { name: "Record donation" });
    const payload = createDonationActionMock.mock.calls[0][0];
    expect(payload.eventId).toBe("event-2");
  });
});
