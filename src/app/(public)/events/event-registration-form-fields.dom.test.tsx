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

  // #686. The whole of the degraded path: a tenant that has adopted no
  // participant agreement sees the form exactly as it was before this shipped,
  // and posts nothing about one.
  test("says nothing about an agreement when the tenant takes none", async () => {
    render(<EventRegistrationForm eventId="event-1" />);

    expect(screen.queryByRole("checkbox")).toBeNull();

    await userEvent.type(screen.getByLabelText(/^Name/), "Jane");
    await userEvent.type(screen.getByLabelText(/^Email/), "jane@example.com");
    await userEvent.click(
      screen.getByRole("button", { name: "Complete registration" }),
    );

    const submission = lastSubmission();
    expect(submission.waiverAccepted).toBeUndefined();
    expect(submission.waiverVersion).toBeUndefined();
  });

  test("the agreement's box starts unticked", () => {
    render(
      <EventRegistrationForm
        eventId="event-1"
        waiver={{ version: 3 }}
        waiverBlock={<p>The agreement itself</p>}
      />,
    );

    expect(screen.getByText("The agreement itself")).toBeVisible();
    const box = screen.getByRole("checkbox", { name: /I have read the/ });
    expect(box).not.toBeChecked();
    // A pre-ticked box is not an acceptance, and `required` is what makes the
    // browser say which control is missing rather than silently refusing.
    expect(box).toBeRequired();
  });

  test("posts the acceptance and the version it was shown", async () => {
    render(
      <EventRegistrationForm
        eventId="event-1"
        waiver={{ version: 3 }}
        waiverBlock={<p>The agreement itself</p>}
      />,
    );

    await userEvent.type(screen.getByLabelText(/^Name/), "Jane");
    await userEvent.type(screen.getByLabelText(/^Email/), "jane@example.com");
    await userEvent.click(
      screen.getByRole("checkbox", { name: /I have read the/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Complete registration" }),
    );

    expect(lastSubmission()).toMatchObject({
      waiverAccepted: "on",
      // Sent so the server can refuse a submission made against text that has
      // been republished since it was rendered.
      waiverVersion: "3",
    });
  });

  // An untouched box does not submit at all: `required` blocks it in the
  // browser, which is why the label says so rather than the button going grey.
  // That is a convenience and never the gate -- `accepted_waiver_version()`
  // refuses the same submission server-side, which is what an integration test
  // covers and this cannot.
  test("an untouched box does not submit", async () => {
    render(
      <EventRegistrationForm
        eventId="event-1"
        waiver={{ version: 3 }}
        waiverBlock={<p>The agreement itself</p>}
      />,
    );

    await userEvent.type(screen.getByLabelText(/^Name/), "Jane");
    await userEvent.type(screen.getByLabelText(/^Email/), "jane@example.com");
    await userEvent.click(
      screen.getByRole("button", { name: "Complete registration" }),
    );

    expect(registerForEventActionMock).not.toHaveBeenCalled();
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
