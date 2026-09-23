import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RegistrationStep } from "./registration-step";

// As in event-registration-form-fields.dom.test.tsx: the action module reaches
// a `server-only` client, so the guard is neutralised and the action mocked.
mock.module("server-only", () => ({}));

type RegisterForEventResult =
  | { error: string; step: RegistrationStep }
  | { success: true; registrationId: string };

const registerForEventActionMock = mock<
  (eventId: string, formData: FormData) => Promise<RegisterForEventResult>
>(async () => ({ success: true, registrationId: "reg-1" }));

mock.module("./event-registration-actions", () => ({
  registerForEventAction: registerForEventActionMock,
}));

const { EventRegistrationForm } =
  await import("./event-registration-form-fields");

type User = ReturnType<typeof userEvent.setup>;

const aboutYou = () => screen.queryByRole("group", { name: /About you/ });
const thisEvent = () => screen.queryByRole("group", { name: /This event/ });
const review = () => screen.queryByRole("group", { name: /Review and agree/ });
const next = () => screen.getByRole("button", { name: "Next" });

async function fillAboutYou(user: User) {
  await user.type(screen.getByLabelText(/^Name/), "Jane");
  await user.type(screen.getByLabelText(/^Email/), "jane@example.com");
}

async function fillThisEvent(user: User) {
  await user.click(screen.getByLabelText(/under 18/i));
  await user.click(
    screen.getByRole("option", { name: /everyone is 18 or over/i }),
  );
}

async function reachReview(user: User) {
  await fillAboutYou(user);
  await user.click(next());
  await fillThisEvent(user);
  await user.click(next());
}

describe("RegistrationSteps (#1413)", () => {
  beforeEach(() => {
    registerForEventActionMock.mockClear();
  });

  test("starts on About you, with Next and no submit or Back", () => {
    render(<EventRegistrationForm eventId="event-1" />);

    expect(aboutYou()).toBeVisible();
    expect(screen.getByText("Step 1 of 3")).toBeVisible();
    expect(thisEvent()).toBeNull();
    expect(review()).toBeNull();
    expect(next()).toBeVisible();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Complete registration" }),
    ).toBeNull();
  });

  // Cancel belongs to the disclosure the form sits in (#1427), so a form
  // rendered outside one offers none -- there is nothing to cancel back to.
  test("offers Cancel only inside the Register disclosure", async () => {
    const { EventRegistrationDisclosure } =
      await import("./event-registration-disclosure");
    const { unmount } = render(<EventRegistrationForm eventId="event-1" />);
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    unmount();

    const user = userEvent.setup();
    render(
      <EventRegistrationDisclosure eventName="Winter Gear Swap">
        <EventRegistrationForm eventId="event-1" />
      </EventRegistrationDisclosure>,
    );
    await user.click(screen.getByRole("button", { name: "Register" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(aboutYou()).toBeNull();
    expect(screen.getByRole("button", { name: "Register" })).toBeVisible();
  });

  test("does not ask for a phone number", () => {
    render(<EventRegistrationForm eventId="event-1" />);

    expect(screen.queryByLabelText(/phone/i)).toBeNull();
  });

  test("Next will not leave a required field empty behind it", async () => {
    const user = userEvent.setup();
    render(<EventRegistrationForm eventId="event-1" />);

    await user.click(next());
    expect(aboutYou()).toBeVisible();

    await fillAboutYou(user);
    await user.click(next());
    expect(thisEvent()).toBeVisible();

    // The under-18 question is required on this step.
    await user.click(next());
    expect(thisEvent()).toBeVisible();
    expect(review()).toBeNull();
  });

  test("walks all three steps, and Back keeps what was typed", async () => {
    const user = userEvent.setup();
    render(<EventRegistrationForm eventId="event-1" />);
    await fillAboutYou(user);

    await user.click(next());
    expect(thisEvent()).toHaveFocus();
    expect(screen.getByText("Step 2 of 3")).toBeVisible();
    await fillThisEvent(user);

    await user.click(next());
    expect(review()).toHaveFocus();
    expect(
      screen.getByRole("button", { name: "Complete registration" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(aboutYou()).toBeVisible();
    expect(screen.getByLabelText(/^Name/)).toHaveValue("Jane");
    expect(screen.getByLabelText(/^Email/)).toHaveValue("jane@example.com");
  });

  test("the review summarises both steps, and Edit goes back to each", async () => {
    const user = userEvent.setup();
    render(<EventRegistrationForm eventId="event-1" />);
    await reachReview(user);

    const summary = review()!;
    expect(summary).toHaveTextContent("Jane");
    expect(summary).toHaveTextContent("jane@example.com");
    expect(summary).toHaveTextContent("Number attending");
    expect(summary).toHaveTextContent("everyone is 18 or over");

    await user.click(screen.getByRole("button", { name: "Edit this event" }));
    expect(thisEvent()).toHaveFocus();

    await user.click(next());
    await user.click(screen.getByRole("button", { name: "Edit about you" }));
    expect(aboutYou()).toHaveFocus();
  });

  test("Enter in a field before the last step means Next, not submit", async () => {
    const user = userEvent.setup();
    render(<EventRegistrationForm eventId="event-1" />);
    await fillAboutYou(user);

    await user.type(screen.getByLabelText(/^Name/), "{Enter}");

    expect(registerForEventActionMock).not.toHaveBeenCalled();
    expect(thisEvent()).toBeVisible();
  });

  test("submits from the review step", async () => {
    const user = userEvent.setup();
    render(<EventRegistrationForm eventId="event-1" />);
    await reachReview(user);

    await user.click(
      screen.getByRole("button", { name: "Complete registration" }),
    );

    expect(registerForEventActionMock).toHaveBeenCalledTimes(1);
    const formData = registerForEventActionMock.mock.calls[0][1];
    expect(formData.has("phone")).toBe(false);
  });

  test.each([
    ["about", "This email is already registered for this event.", aboutYou],
    ["event", "Party size must be at least 1.", thisEvent],
    ["review", "This event has reached capacity.", review],
  ] as const)(
    "a server error about the %s step comes back to it",
    async (step, message, group) => {
      registerForEventActionMock.mockImplementationOnce(async () => ({
        error: message,
        step,
      }));
      const user = userEvent.setup();
      render(<EventRegistrationForm eventId="event-1" />);
      await reachReview(user);

      await user.click(
        screen.getByRole("button", { name: "Complete registration" }),
      );

      expect(group()).toBeVisible();
      expect(screen.getByText(message)).toBeVisible();
    },
  );
});
