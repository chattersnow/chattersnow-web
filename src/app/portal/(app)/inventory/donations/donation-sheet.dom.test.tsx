import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DonationRow } from "./donation-shared";
import * as DonationActions from "./actions";
import * as ItemActions from "../items/actions";

type ActionResult = { error: string } | { success: true };

const updateDonationActionMock = mock<
  (id: string, formData: FormData) => Promise<ActionResult>
>(async () => ({ success: true }));
const updateInventoryItemActionMock = mock<
  (id: string, formData: FormData) => Promise<ActionResult>
>(async () => ({ success: true }));

mock.module("./actions", () => ({
  ...DonationActions,
  updateDonationAction: updateDonationActionMock,
}));
mock.module("../items/actions", () => ({
  ...ItemActions,
  updateInventoryItemAction: updateInventoryItemActionMock,
}));

const { DonationSheet } = await import("./donation-sheet");

// face_value is intentionally null here: happy-dom's numeric step-mismatch
// algorithm for <input type="number" step="0.01"> misreports valid values
// (e.g. "40") as invalid, which silently blocks the Save button's
// form="..." submission in these tests. Not exercised by these cases anyway.
function makeDonation(overrides: Partial<DonationRow> = {}): DonationRow {
  return {
    id: "donation-1",
    donated_at: "2026-05-01T00:00:00.000Z",
    notes: "Dropped off at HQ",
    event_id: null,
    donor: {
      id: "donor-1",
      name: "Jane Donor",
      is_anonymous: false,
      source_type: "individual",
    },
    event: null,
    inventory_items: [
      {
        id: "item-1",
        description: "Winter jacket",
        type: "jacket",
        size: "M",
        gender: "unisex",
        condition: "good",
        face_value: null,
        status: "available",
        photo_url: null,
        notes: null,
      },
    ],
    ...overrides,
  };
}

async function openSheet(
  user: ReturnType<typeof userEvent.setup>,
  donation: DonationRow = makeDonation(),
) {
  render(<DonationSheet donation={donation} />);
  await user.click(screen.getByRole("button", { name: "View donation" }));
}

describe("DonationSheet", () => {
  beforeEach(() => {
    updateDonationActionMock.mockClear();
    updateDonationActionMock.mockImplementation(async () => ({
      success: true,
    }));
    updateInventoryItemActionMock.mockClear();
    updateInventoryItemActionMock.mockImplementation(async () => ({
      success: true,
    }));
  });

  test("shows donation and item details in view mode", async () => {
    const user = userEvent.setup();
    await openSheet(user);

    expect(screen.getByText("Jane Donor")).toBeInTheDocument();
    expect(screen.getByText("Winter jacket")).toBeInTheDocument();
  });

  test("shows Anonymous for an anonymous donor", async () => {
    const user = userEvent.setup();
    await openSheet(
      user,
      makeDonation({
        donor: {
          id: "donor-2",
          name: null,
          is_anonymous: true,
          source_type: "individual",
        },
      }),
    );

    expect(screen.getByText("Anonymous")).toBeInTheDocument();
  });

  test("saves an edited donation date and notes", async () => {
    const user = userEvent.setup();
    await openSheet(user);
    await user.click(screen.getByRole("button", { name: "Edit donation" }));

    const notesField = screen.getByLabelText("Donation notes");
    await user.clear(notesField);
    await user.type(notesField, "Updated notes");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await screen.findByRole("button", { name: "Edit donation" });
    expect(updateDonationActionMock).toHaveBeenCalledTimes(1);
    const formData = updateDonationActionMock.mock.calls[0][1];
    expect(formData.get("notes")).toBe("Updated notes");
    expect(updateInventoryItemActionMock).not.toHaveBeenCalled();
  });

  test("saves an edited item field via updateInventoryItemAction", async () => {
    const user = userEvent.setup();
    await openSheet(user);
    await user.click(screen.getByRole("button", { name: "Edit donation" }));

    const descriptionField = screen.getByLabelText("Item description");
    await user.clear(descriptionField);
    await user.type(descriptionField, "Winter parka");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await screen.findByRole("button", { name: "Edit donation" });
    expect(updateInventoryItemActionMock).toHaveBeenCalledTimes(1);
    const [itemId, formData] = updateInventoryItemActionMock.mock.calls[0];
    expect(itemId).toBe("item-1");
    expect(formData.get("description")).toBe("Winter parka");
    expect(formData.get("status")).toBe("available");
  });

  test("does not call updateInventoryItemAction when no item fields changed", async () => {
    const user = userEvent.setup();
    await openSheet(user);
    await user.click(screen.getByRole("button", { name: "Edit donation" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await screen.findByRole("button", { name: "Edit donation" });
    expect(updateInventoryItemActionMock).not.toHaveBeenCalled();
  });

  test("shows a discard confirmation when closing with unsaved changes", async () => {
    const user = userEvent.setup();
    await openSheet(user);
    await user.click(screen.getByRole("button", { name: "Edit donation" }));

    const notesField = screen.getByLabelText("Donation notes");
    await user.type(notesField, " more");
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.getByText("Discard changes?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Donation notes")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(
      screen.queryByRole("button", { name: "Edit donation" }),
    ).not.toBeInTheDocument();
  });

  test("shows the server error and stays in edit mode on failure", async () => {
    updateDonationActionMock.mockImplementation(async () => ({
      error: "Could not save the donation. Please try again.",
    }));
    const user = userEvent.setup();
    await openSheet(user);
    await user.click(screen.getByRole("button", { name: "Edit donation" }));

    const notesField = screen.getByLabelText("Donation notes");
    await user.type(notesField, " more");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText("Could not save the donation. Please try again."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save changes" }),
    ).toBeInTheDocument();
  });
});
