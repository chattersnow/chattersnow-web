import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MyContactDetails } from "@/lib/constituent/contact";

// The action module reaches the admin client, which is `server-only`-guarded
// and throws outside Next's bundler. Neutralising the guard lets it load so
// that the mock below can replace its one export; nothing in it runs.
mock.module("server-only", () => ({}));

type RegisterMyselfResult =
  { error: string } | { success: true; registrationId: string };

const registerMyselfForEventActionMock = mock<
  (eventId: string, formData: FormData) => Promise<RegisterMyselfResult>
>(async () => ({ success: true, registrationId: "reg-1" }));

mock.module("./my-registration-actions", () => ({
  registerMyselfForEventAction: registerMyselfForEventActionMock,
}));

const { MyEventRegistrationForm } = await import("./my-registration-form");

const person: MyContactDetails = {
  person_id: "person-1",
  name: "Jamie Rivera",
  preferred_name: null,
  email: "jamie@example.test",
  email_pending: null,
  email_pending_expires_at: null,
  phone: null,
  pronouns: null,
  instagram_handle: null,
  preferred_mountain: null,
  riding_discipline: null,
  ski_experience_level: null,
  snowboard_experience_level: null,
  address_line1: null,
  address_line2: null,
  address_city: null,
  address_region: null,
  address_postal_code: null,
  address_country: null,
};

/** The FormData the action was last called with, as plain fields. */
function lastSubmission() {
  const call = registerMyselfForEventActionMock.mock.calls.at(-1);
  if (!call) throw new Error("the registration action was never called");
  return Object.fromEntries(call[1].entries()) as Record<string, string>;
}

// #1259. The one form the ticket allows to skip the question, and it does not:
// the check-in ledger only knows the events this tenant ran on this platform,
// so "have you been before?" is still a fact only the person holds. It is
// asked in the same words the anonymous form uses, from the same component.
describe("MyEventRegistrationForm and the been-before question", () => {
  beforeEach(() => {
    registerMyselfForEventActionMock.mockClear();
  });

  test("asks it, in the same words the anonymous form uses", () => {
    render(<MyEventRegistrationForm eventId="event-1" person={person} />);

    expect(
      screen.getByLabelText("Have you been to one of our events before?"),
    ).toBeVisible();
  });

  test("is not prefilled from the reader's own history", async () => {
    const user = userEvent.setup();
    render(<MyEventRegistrationForm eventId="event-1" person={person} />);

    await user.click(
      screen.getByRole("button", { name: "Complete registration" }),
    );

    // A linked person has a full attendance record in the portal, and it is
    // still not used to answer for them: the column is what they said, and
    // seeding it from the ledger would make it a second copy of the derived
    // figure it exists to sit beside.
    expect(lastSubmission().attendedBefore).toBe("");
  });

  test("submits the answer they give", async () => {
    const user = userEvent.setup();
    render(<MyEventRegistrationForm eventId="event-1" person={person} />);

    await user.click(
      screen.getByLabelText("Have you been to one of our events before?"),
    );
    await user.click(
      screen.getByRole("option", { name: "Yes, I've been to one before" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Complete registration" }),
    );

    expect(lastSubmission().attendedBefore).toBe("yes");
  });
});
