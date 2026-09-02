import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DonationActionResult } from "./actions";
import type { PersonListItem } from "../../people/actions";
import * as DonationActions from "./actions";

const createDonationActionMock = mock<
  (formData: FormData) => Promise<DonationActionResult>
>(async () => ({ success: true }));

mock.module("./actions", () => ({
  ...DonationActions,
  createDonationAction: createDonationActionMock,
}));

const { NewDonationDialog } = await import("./new-donation-dialog");

const events = [{ id: "event-1", name: "Trailhead Cleanup" }];
const people: PersonListItem[] = [
  {
    id: "person-1",
    name: "Jamie Rivera",
    email: "jamie.rivera@example.test",
    phone: null,
    is_sponsor: false,
  },
];

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  render(<NewDonationDialog events={events} people={people} />);
  await user.click(screen.getByRole("button", { name: "New donation" }));
}

// happy-dom's numeric step-mismatch algorithm for <input type="number"
// step="0.01"> misreports valid values (e.g. "25") as invalid, which
// silently blocks click-driven form submission — the same happy-dom bug the
// inventory edit-donation-sheet test dodges. Strip the attribute after
// typing so the submit click goes through.
async function fillAmount(
  user: ReturnType<typeof userEvent.setup>,
  value: string,
) {
  const amount = screen.getByLabelText("Amount");
  await user.type(amount, value);
  amount.removeAttribute("step");
}

async function selectMethod(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
) {
  await user.click(screen.getByLabelText("Payment method"));
  const listbox = await screen.findByRole("listbox");
  await user.click(within(listbox).getByText(label, { exact: true }));
}

describe("NewDonationDialog", () => {
  beforeEach(() => {
    createDonationActionMock.mockClear();
    createDonationActionMock.mockImplementation(async () => ({
      success: true,
    }));
  });

  test("submits an anonymous donation when no donor is picked", async () => {
    const user = userEvent.setup();
    await openDialog(user);

    await selectMethod(user, "Cash");
    await fillAmount(user, "25");
    await user.type(screen.getByLabelText("Notes"), "Office donation box");
    await user.click(screen.getByRole("button", { name: "Add donation" }));

    expect(createDonationActionMock).toHaveBeenCalledTimes(1);
    const submitted = createDonationActionMock.mock.calls[0][0];
    expect(submitted.get("donorId")).toBe("");
    expect(submitted.get("method")).toBe("cash");
    expect(submitted.get("amount")).toBe("25");
    expect(submitted.get("notes")).toBe("Office donation box");
  });

  test("submits the picked donor's id after searching for them", async () => {
    const user = userEvent.setup();
    await openDialog(user);

    await user.type(
      screen.getByPlaceholderText("Search donors by name or email..."),
      "Jamie",
    );
    await user.click(screen.getByRole("button", { name: /Jamie Rivera/ }));

    // The picker collapses to the selected person with a "Change" affordance.
    expect(screen.getByRole("button", { name: "Change" })).toBeInTheDocument();

    await selectMethod(user, "Check");
    await fillAmount(user, "100");
    await user.click(screen.getByRole("button", { name: "Add donation" }));

    expect(createDonationActionMock).toHaveBeenCalledTimes(1);
    const submitted = createDonationActionMock.mock.calls[0][0];
    expect(submitted.get("donorId")).toBe("person-1");
    expect(submitted.get("method")).toBe("check");
  });

  test("shows the server error and keeps the dialog open on failure", async () => {
    createDonationActionMock.mockImplementation(async () => ({
      error: "Could not save the donation. Please try again.",
    }));
    const user = userEvent.setup();
    await openDialog(user);

    await selectMethod(user, "Cash");
    await fillAmount(user, "25");
    await user.click(screen.getByRole("button", { name: "Add donation" }));

    expect(
      await screen.findByText("Could not save the donation. Please try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
