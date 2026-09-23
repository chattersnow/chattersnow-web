import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
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

/**
 * Tailwind is not loaded here, so without this every step is on screen and
 * the form behaves as it does on a wide one. This is the one rule the stepping
 * depends on, applied as a phone would apply it.
 */
function actLikeAPhone() {
  const style = document.createElement("style");
  style.textContent = '[class~="max-sm:hidden"] { display: none; }';
  document.head.append(style);
  return () => style.remove();
}

async function fillAboutYou(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^Name/), "Jane");
  await user.type(screen.getByLabelText(/^Email/), "jane@example.com");
  await user.click(screen.getByLabelText(/under 18/i));
  await user.click(
    screen.getByRole("option", { name: /everyone is 18 or over/i }),
  );
}

const aboutYou = () => screen.getByRole("group", { name: /About you/ });
const beforeYouGo = () => screen.getByRole("group", { name: /Before you go/ });

describe("RegistrationSteps (#1403)", () => {
  beforeEach(() => {
    registerForEventActionMock.mockClear();
  });

  test("a wide screen shows both groups, under their legends", () => {
    render(<EventRegistrationForm eventId="event-1" />);

    expect(aboutYou()).toBeVisible();
    expect(beforeYouGo()).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Complete registration" }),
    ).toBeVisible();
  });

  describe("on a phone", () => {
    let restore: () => void;
    beforeEach(() => {
      restore = actLikeAPhone();
    });
    afterEach(() => restore());

    test("starts on the first step, with Next and no submit", () => {
      render(<EventRegistrationForm eventId="event-1" />);

      expect(aboutYou()).toBeVisible();
      expect(screen.queryByRole("group", { name: /Before you go/ })).toBeNull();
      expect(screen.getByRole("button", { name: "Next" })).toBeVisible();
      expect(
        screen.queryByRole("button", { name: "Complete registration" }),
      ).toBeNull();
    });

    test("Next will not leave a required field empty behind it", async () => {
      const user = userEvent.setup();
      render(<EventRegistrationForm eventId="event-1" />);

      await user.click(screen.getByRole("button", { name: "Next" }));

      expect(aboutYou()).toBeVisible();
      expect(screen.queryByRole("group", { name: /Before you go/ })).toBeNull();
    });

    test("Next moves on, and Back keeps what was typed", async () => {
      const user = userEvent.setup();
      render(<EventRegistrationForm eventId="event-1" />);
      await fillAboutYou(user);

      await user.click(screen.getByRole("button", { name: "Next" }));
      expect(beforeYouGo()).toBeVisible();
      expect(beforeYouGo()).toHaveFocus();
      expect(screen.queryByRole("group", { name: /About you/ })).toBeNull();

      await user.click(screen.getByRole("button", { name: "Back" }));
      expect(aboutYou()).toBeVisible();
      expect(screen.getByLabelText(/^Name/)).toHaveValue("Jane");
      expect(screen.getByLabelText(/^Email/)).toHaveValue("jane@example.com");
    });

    test("Enter in a first-step field means Next, not submit", async () => {
      const user = userEvent.setup();
      render(<EventRegistrationForm eventId="event-1" />);
      await fillAboutYou(user);

      await user.type(screen.getByLabelText(/^Name/), "{Enter}");

      expect(registerForEventActionMock).not.toHaveBeenCalled();
      expect(beforeYouGo()).toBeVisible();
    });

    test("an error about a first-step field comes back to that step", async () => {
      registerForEventActionMock.mockImplementationOnce(async () => ({
        error: "This email is already registered for this event.",
        step: "details",
      }));
      const user = userEvent.setup();
      render(<EventRegistrationForm eventId="event-1" />);
      await fillAboutYou(user);
      await user.click(screen.getByRole("button", { name: "Next" }));

      await user.click(
        screen.getByRole("button", { name: "Complete registration" }),
      );

      expect(aboutYou()).toBeVisible();
      expect(
        screen.getByText("This email is already registered for this event."),
      ).toBeVisible();
    });

    test("any other error stays with the button", async () => {
      registerForEventActionMock.mockImplementationOnce(async () => ({
        error: "This event has reached capacity.",
        step: "confirm",
      }));
      const user = userEvent.setup();
      render(<EventRegistrationForm eventId="event-1" />);
      await fillAboutYou(user);
      await user.click(screen.getByRole("button", { name: "Next" }));

      await user.click(
        screen.getByRole("button", { name: "Complete registration" }),
      );

      expect(beforeYouGo()).toBeVisible();
      expect(
        screen.getByText("This event has reached capacity."),
      ).toBeVisible();
    });
  });
});
