import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The action module reaches the admin client, which is `server-only`-guarded
// and throws outside Next's bundler. Neutralising the guard lets it load so
// that the mock below can replace its one export; nothing in it runs.
mock.module("server-only", () => ({}));

type RegisterForEventResult =
  { error: string } | { success: true; registrationId: string };

const registerForEventActionMock = mock<
  (eventId: string, formData: FormData) => Promise<RegisterForEventResult>
>(async () => ({ success: true, registrationId: "reg-1" }));

mock.module("./event-registration-actions", () => ({
  registerForEventAction: registerForEventActionMock,
}));

const { EventRegistrationForm } =
  await import("./event-registration-form-fields");

/** The (eventId, FormData) the action was last called with, as plain fields. */
function lastSubmission() {
  const call = registerForEventActionMock.mock.calls.at(-1);
  if (!call) throw new Error("the registration action was never called");
  return Object.fromEntries(call[1].entries()) as Record<string, string>;
}

describe("EventRegistrationForm", () => {
  beforeEach(() => {
    registerForEventActionMock.mockClear();
  });

  test("a visitor with no session gets the blank form it always had", () => {
    render(<EventRegistrationForm eventId="event-1" />);

    expect(screen.getByLabelText(/^Name/)).toHaveValue("");
    expect(screen.getByLabelText(/^Email/)).toHaveValue("");
    expect(screen.queryByText(/Signed in as/)).toBeNull();
  });

  // #1257: an account between signing up and having its claim approved has no
  // `people` row, so it lands here rather than on MyEventRegistrationForm --
  // but the application is already holding its name and address, and asking it
  // to retype them is how a second copy of somebody gets made.
  test("prefills name and email from the account's own session", () => {
    render(
      <EventRegistrationForm
        eventId="event-1"
        account={{ email: "jane@example.com", name: "Jane Rivers" }}
      />,
    );

    expect(screen.getByLabelText(/^Name/)).toHaveValue("Jane Rivers");
    expect(screen.getByLabelText(/^Email/)).toHaveValue("jane@example.com");
    expect(screen.getByText("Signed in as jane@example.com.")).toBeVisible();
  });

  test("a provider that gave no name prefills the address alone", () => {
    render(
      <EventRegistrationForm
        eventId="event-1"
        account={{ email: "jane@example.com", name: null }}
      />,
    );

    expect(screen.getByLabelText(/^Name/)).toHaveValue("");
    expect(screen.getByLabelText(/^Email/)).toHaveValue("jane@example.com");
  });

  test("the prefilled form still posts through the anonymous action", async () => {
    const user = userEvent.setup();
    render(
      <EventRegistrationForm
        eventId="event-1"
        account={{ email: "jane@example.com", name: "Jane Rivers" }}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Complete registration" }),
    );

    expect(registerForEventActionMock).toHaveBeenCalledTimes(1);
    expect(registerForEventActionMock.mock.calls[0][0]).toBe("event-1");
    expect(lastSubmission()).toMatchObject({
      name: "Jane Rivers",
      email: "jane@example.com",
    });
  });

  // A prefill, not an attribution: the account's address is a starting point,
  // and somebody registering a partner from their own browser overwrites it.
  test("an edited prefill is what gets submitted", async () => {
    const user = userEvent.setup();
    render(
      <EventRegistrationForm
        eventId="event-1"
        account={{ email: "jane@example.com", name: "Jane Rivers" }}
      />,
    );

    await user.clear(screen.getByLabelText(/^Email/));
    await user.type(screen.getByLabelText(/^Email/), "sam@example.com");
    await user.click(
      screen.getByRole("button", { name: "Complete registration" }),
    );

    expect(lastSubmission()).toMatchObject({ email: "sam@example.com" });
  });

  // #1259. The acceptance criterion in one test: the question reads the same
  // for a visitor with no session and for an account, because a question only
  // some people see answers "do you have a record of me?" for anybody who can
  // fill in a form.
  test("asks everyone whether they have been before, in the same words", () => {
    const { unmount } = render(<EventRegistrationForm eventId="event-1" />);
    expect(
      screen.getByLabelText("Have you been to one of our events before?"),
    ).toBeVisible();
    unmount();

    render(
      <EventRegistrationForm
        eventId="event-1"
        account={{ email: "jane@example.com", name: "Jane Rivers" }}
      />,
    );
    expect(
      screen.getByLabelText("Have you been to one of our events before?"),
    ).toBeVisible();
  });

  test("submits nothing for the question when it is left alone", async () => {
    const user = userEvent.setup();
    render(<EventRegistrationForm eventId="event-1" />);

    await user.type(screen.getByLabelText(/^Name/), "Jane Rivers");
    await user.type(screen.getByLabelText(/^Email/), "jane@example.com");
    await user.click(
      screen.getByRole("button", { name: "Complete registration" }),
    );

    // Empty, which `parseAttendedBefore` reads as unanswered. Not "no".
    expect(lastSubmission().attendedBefore).toBe("");
  });

  test("submits a first-timer's answer", async () => {
    const user = userEvent.setup();
    render(<EventRegistrationForm eventId="event-1" />);

    await user.type(screen.getByLabelText(/^Name/), "Jane Rivers");
    await user.type(screen.getByLabelText(/^Email/), "jane@example.com");
    await user.click(
      screen.getByLabelText("Have you been to one of our events before?"),
    );
    await user.click(
      screen.getByRole("option", { name: "No, this would be my first" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Complete registration" }),
    );

    expect(lastSubmission().attendedBefore).toBe("no");
  });
});
