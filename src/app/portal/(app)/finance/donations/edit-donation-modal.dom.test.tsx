import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DonationActionResult } from "./actions";
import type { MonetaryDonationRow } from "./donations-shared";
import type { PersonListItem } from "../../people/actions";
import * as DonationActions from "./actions";
import { labelText } from "../../../../../../test/labels";

const updateDonationActionMock = mock<
  (id: string, formData: FormData) => Promise<DonationActionResult>
>(async () => ({ success: true }));
const deleteDonationActionMock = mock<
  (id: string) => Promise<DonationActionResult>
>(async () => ({ success: true }));

mock.module("./actions", () => ({
  ...DonationActions,
  updateDonationAction: updateDonationActionMock,
  deleteDonationAction: deleteDonationActionMock,
}));

const { EditDonationModal } = await import("./edit-donation-modal");

const events = [{ id: "event-1", name: "Trailhead Cleanup" }];
const people: PersonListItem[] = [
  {
    id: "person-1",
    name: "Jamie Rivera",
    email: "jamie.rivera@example.test",
    phone: null,
  },
];

const donation: MonetaryDonationRow = {
  id: "donation-1",
  donor_id: "person-1",
  event_id: "event-1",
  amount: "100.00",
  method: "check",
  received_date: "2026-08-08",
  notes: "Annual gift.",
  source: "manual",
  external_reference: null,
  processor_label: null,
  gross_amount: null,
  fee_amount: null,
  people: { name: "Jamie Rivera" },
  events: { name: "Trailhead Cleanup" },
};

/** The same gift as a processor reported it (#1390). */
const importedDonation: MonetaryDonationRow = {
  ...donation,
  id: "donation-2",
  donor_id: null,
  amount: "94.55",
  method: "online",
  source: "import",
  external_reference: "ch_3Pabc123",
  processor_label: "Donorbox",
  gross_amount: "100.00",
  fee_amount: "5.45",
  people: null,
};

async function openSheet(
  user: ReturnType<typeof userEvent.setup>,
  row: MonetaryDonationRow = donation,
) {
  render(<EditDonationModal donation={row} events={events} people={people} />);
  await user.click(screen.getByRole("button", { name: "View donation" }));
}

async function enterEditMode(user: ReturnType<typeof userEvent.setup>) {
  await openSheet(user);
  await user.click(screen.getByRole("button", { name: "Edit donation" }));
  // happy-dom's numeric step-mismatch algorithm for <input type="number"
  // step="0.01"> misreports valid values (e.g. "100") as invalid, which
  // silently blocks click-driven form submission — the same happy-dom bug
  // the inventory edit-donation-sheet test dodges.
  screen.getByLabelText(labelText("Amount")).removeAttribute("step");
}

describe("EditDonationModal", () => {
  beforeEach(() => {
    updateDonationActionMock.mockClear();
    updateDonationActionMock.mockImplementation(async () => ({
      success: true,
    }));
    deleteDonationActionMock.mockClear();
    deleteDonationActionMock.mockImplementation(async () => ({
      success: true,
    }));
  });

  test("shows the donation's details in view mode", async () => {
    const user = userEvent.setup();
    await openSheet(user);

    expect(screen.getByText("Jamie Rivera")).toBeInTheDocument();
    expect(screen.getByText("Check")).toBeInTheDocument();
    expect(screen.getByText("Trailhead Cleanup")).toBeInTheDocument();
    expect(screen.getByText("$100.00")).toBeInTheDocument();
    expect(screen.getByText("Annual gift.")).toBeInTheDocument();
  });

  test("labels a donation without a donor as anonymous", async () => {
    const user = userEvent.setup();
    await openSheet(user, { ...donation, donor_id: null, people: null });

    expect(screen.getByText("Anonymous")).toBeInTheDocument();
  });

  test("entering edit mode pre-fills the form from the donation", async () => {
    const user = userEvent.setup();
    await enterEditMode(user);

    expect(screen.getByLabelText(labelText("Amount"))).toHaveValue(100);
    expect(screen.getByLabelText(labelText("Date"))).toHaveValue("2026-08-08");
    expect(screen.getByLabelText("Notes")).toHaveValue("Annual gift.");
  });

  test("exiting edit mode with unsaved changes asks to discard", async () => {
    const user = userEvent.setup();
    await enterEditMode(user);

    await user.clear(screen.getByLabelText(labelText("Amount")));
    await user.type(screen.getByLabelText(labelText("Amount")), "150");
    await user.click(screen.getByRole("button", { name: "View" }));

    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(screen.getByText("$100.00")).toBeInTheDocument();
  });

  test("saves the form and returns to view mode on success", async () => {
    const user = userEvent.setup();
    await enterEditMode(user);

    await user.clear(screen.getByLabelText(labelText("Amount")));
    await user.type(screen.getByLabelText(labelText("Amount")), "150");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await screen.findByRole("button", { name: "Edit donation" });
    expect(updateDonationActionMock).toHaveBeenCalledTimes(1);
    expect(updateDonationActionMock.mock.calls[0][0]).toBe("donation-1");

    const submitted = updateDonationActionMock.mock.calls[0][1];
    expect(submitted.get("amount")).toBe("150");
    expect(submitted.get("donorId")).toBe("person-1");
    expect(submitted.get("method")).toBe("check");
  });

  test("shows the server error and stays in edit mode on failure", async () => {
    updateDonationActionMock.mockImplementation(async () => ({
      error: "Could not update the donation. Please try again.",
    }));
    const user = userEvent.setup();
    await enterEditMode(user);

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText(
        "Could not update the donation. Please try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(labelText("Amount"))).toBeInTheDocument();
  });

  test("an imported gift shows what the provider reported (#1390)", async () => {
    const user = userEvent.setup();
    await openSheet(user, importedDonation);

    expect(screen.getByText("Imported — Donorbox")).toBeInTheDocument();
    expect(screen.getByText("ch_3Pabc123")).toBeInTheDocument();
    expect(screen.getByText("$94.55")).toBeInTheDocument();
    expect(screen.getByText("$100.00")).toBeInTheDocument();
    expect(screen.getByText("$5.45")).toBeInTheDocument();
  });

  test("an imported gift's amount is not editable — a mistake is a re-import", async () => {
    const user = userEvent.setup();
    await openSheet(user, importedDonation);
    await user.click(screen.getByRole("button", { name: "Edit donation" }));

    expect(screen.queryByLabelText(labelText("Amount"))).toBeNull();
    // What a human legitimately adds afterwards is still there.
    expect(screen.getByLabelText("Notes")).toBeInTheDocument();
    expect(screen.getByLabelText(labelText("Date"))).toBeInTheDocument();
  });

  test("deletes the donation after confirming", async () => {
    const user = userEvent.setup();
    await openSheet(user);

    await user.click(screen.getByRole("button", { name: /Delete/ }));
    const confirmDialog = await screen.findByRole("alertdialog");
    expect(
      within(confirmDialog).getByText("Delete this donation?"),
    ).toBeInTheDocument();

    await user.click(
      within(confirmDialog).getByRole("button", { name: "Delete" }),
    );

    expect(deleteDonationActionMock).toHaveBeenCalledTimes(1);
    expect(deleteDonationActionMock.mock.calls[0][0]).toBe("donation-1");
  });
});
