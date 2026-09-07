import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DonationActionResult } from "./actions";
import type { PersonListItem } from "../../people/actions";
import * as DonationActions from "./actions";
import * as EventActions from "../../events/actions";
import * as PeopleActions from "../../people/actions";

const createDonationActionMock = mock<
  (formData: FormData) => Promise<DonationActionResult>
>(async () => ({ success: true }));

mock.module("./actions", () => ({
  ...DonationActions,
  createDonationAction: createDonationActionMock,
}));

// Callers that pass neither list -- the sidebar quick action -- make the
// dialog load its own options on open.
const listEventOptionsActionMock = mock(async () => ({
  data: [{ id: "event-2", name: "Sidebar Loaded Event" }],
}));
const listPeopleActionMock = mock(async () => ({
  data: [] as PersonListItem[],
}));

mock.module("../../events/actions", () => ({
  ...EventActions,
  listEventOptionsAction: listEventOptionsActionMock,
}));
mock.module("../../people/actions", () => ({
  ...PeopleActions,
  listPeopleAction: listPeopleActionMock,
}));

const { NewDonationDialog } = await import("./new-donation-dialog");

const events = [{ id: "event-1", name: "Trailhead Cleanup" }];
const people: PersonListItem[] = [
  {
    id: "person-1",
    name: "Jamie Rivera",
    email: "jamie.rivera@example.test",
    phone: null,
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
    await user.click(
      await screen.findByRole("option", { name: /Jamie Rivera/ }),
    );

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

  test("loads its own event and person options when given none", async () => {
    listEventOptionsActionMock.mockClear();
    listPeopleActionMock.mockClear();
    const user = userEvent.setup();
    render(<NewDonationDialog />);
    await user.click(screen.getByRole("button", { name: "New donation" }));

    expect(listEventOptionsActionMock).toHaveBeenCalled();
    expect(listPeopleActionMock).toHaveBeenCalled();
  });
});
