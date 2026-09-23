import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The action module reaches the admin client, which is `server-only`-guarded
// and throws outside Next's bundler. Neutralising the guard lets it load so
// that the mock below can replace its one export; nothing in it runs.
mock.module("server-only", () => ({}));

type RegisterForEventResult =
  | { error: string; step: "details" | "confirm" }
  | { success: true; registrationId: string };

const registerForEventActionMock = mock<
  (eventId: string, formData: FormData) => Promise<RegisterForEventResult>
>(async () => ({ success: true, registrationId: "reg-1" }));

mock.module("./event-registration-actions", () => ({
  registerForEventAction: registerForEventActionMock,
}));

const { EventRegistrationForm } =
  await import("./event-registration-form-fields");

import { PHOTO_CONSENT_HEADING } from "@/lib/photo-consent";

/**
 * #685: the minors question is required, so every case that expects a
 * submission has to answer it. "No" is the answer that leaves the rest of the
 * form exactly as it was.
 */
// Structural rather than `typeof userEvent`: the default export and what
// `userEvent.setup()` returns are different types, and both are passed here.
async function sayNoMinors(
  user: { click: (element: Element) => Promise<unknown> } = userEvent,
) {
  await user.click(screen.getByLabelText(/under 18/i));
  await user.click(
    screen.getByRole("option", { name: /everyone is 18 or over/i }),
  );
}

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
    await sayNoMinors();
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
        waiver={{ version: 3, title: "Participant Waiver" }}
        waiverBlock={<p>The agreement itself</p>}
      />,
    );

    expect(screen.getByText("The agreement itself")).toBeVisible();
    const box = screen.getByRole("checkbox", {
      name: /I have read and accept/,
    });
    expect(box).not.toBeChecked();
    // Named, not "the agreement above" (#1402): the full text is now behind a
    // button, so the box says which document it accepts.
    expect(box).toHaveAccessibleName(
      "I have read and accept the Participant Waiver",
    );
    // A pre-ticked box is not an acceptance, and `required` is what makes the
    // browser say which control is missing rather than silently refusing.
    expect(box).toBeRequired();
  });

  test("posts the acceptance and the version it was shown", async () => {
    render(
      <EventRegistrationForm
        eventId="event-1"
        waiver={{ version: 3, title: "Participant Waiver" }}
        waiverBlock={<p>The agreement itself</p>}
      />,
    );

    await userEvent.type(screen.getByLabelText(/^Name/), "Jane");
    await userEvent.type(screen.getByLabelText(/^Email/), "jane@example.com");
    await userEvent.click(
      screen.getByRole("checkbox", { name: /I have read and accept/ }),
    );
    await sayNoMinors();
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
        waiver={{ version: 3, title: "Participant Waiver" }}
        waiverBlock={<p>The agreement itself</p>}
      />,
    );

    await userEvent.type(screen.getByLabelText(/^Name/), "Jane");
    await userEvent.type(screen.getByLabelText(/^Email/), "jane@example.com");
    await sayNoMinors();
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

    await sayNoMinors(user);
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
    await sayNoMinors(user);
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
    await sayNoMinors(user);
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
    await sayNoMinors(user);
    await user.click(
      screen.getByRole("button", { name: "Complete registration" }),
    );

    expect(lastSubmission().attendedBefore).toBe("no");
  });
});

// #685. The three things the block has to get right: it is asked of everybody
// identically, it is required, and what it reveals is the organization's own
// rule rather than one the platform wrote.
describe("EventRegistrationForm and the minors question", () => {
  beforeEach(() => {
    registerForEventActionMock.mockClear();
  });

  test("asks everyone, in the same words", () => {
    const { unmount } = render(<EventRegistrationForm eventId="event-1" />);
    expect(
      screen.getByLabelText(/Is anyone in your party under 18\?/),
    ).toBeVisible();
    unmount();

    render(
      <EventRegistrationForm
        eventId="event-1"
        account={{ email: "jane@example.com", name: "Jane Rivers" }}
      />,
    );
    expect(
      screen.getByLabelText(/Is anyone in your party under 18\?/),
    ).toBeVisible();
  });

  test("nothing about an accompanying adult until the answer is yes", async () => {
    const user = userEvent.setup();
    render(
      <EventRegistrationForm
        eventId="event-1"
        minorAccompaniment={["An adult has to be with them for the whole day."]}
      />,
    );

    expect(screen.queryByLabelText(/Accompanying adult/i)).toBeNull();
    expect(
      screen.queryByText("An adult has to be with them for the whole day."),
    ).toBeNull();

    await user.click(screen.getByLabelText(/under 18/i));
    await user.click(screen.getByRole("option", { name: "Yes" }));

    expect(
      screen.getByText("An adult has to be with them for the whole day."),
    ).toBeVisible();
    expect(screen.getByLabelText(/Accompanying adult's name/i)).toBeVisible();
  });

  test("a yes posts the four contacts with it", async () => {
    const user = userEvent.setup();
    render(<EventRegistrationForm eventId="event-1" />);

    await user.type(screen.getByLabelText(/^Name/), "Jane Rivers");
    await user.type(screen.getByLabelText(/^Email/), "jane@example.com");
    await user.click(screen.getByLabelText(/under 18/i));
    await user.click(screen.getByRole("option", { name: "Yes" }));
    await user.type(
      screen.getByLabelText(/Accompanying adult's name/i),
      "Jane Rivers",
    );
    await user.type(
      screen.getByLabelText(/Accompanying adult's mobile/i),
      "555-0101",
    );
    await user.type(
      screen.getByLabelText(/Emergency contact's name/i),
      "Robin Rivers",
    );
    await user.type(
      screen.getByLabelText(/Emergency contact's phone/i),
      "555-0102",
    );
    await user.click(
      screen.getByRole("button", { name: "Complete registration" }),
    );

    expect(lastSubmission()).toMatchObject({
      partyIncludesMinor: "yes",
      accompanyingAdultName: "Jane Rivers",
      accompanyingAdultPhone: "555-0101",
      emergencyContactName: "Robin Rivers",
      emergencyContactPhone: "555-0102",
    });
  });

  // Changed their mind. Nobody agreed to give a guardian's number for a party
  // that has none, so the form stops sending them.
  test("going back to no sends no contacts", async () => {
    const user = userEvent.setup();
    render(<EventRegistrationForm eventId="event-1" />);

    await user.type(screen.getByLabelText(/^Name/), "Jane Rivers");
    await user.type(screen.getByLabelText(/^Email/), "jane@example.com");
    await user.click(screen.getByLabelText(/under 18/i));
    await user.click(screen.getByRole("option", { name: "Yes" }));
    await user.type(
      screen.getByLabelText(/Accompanying adult's name/i),
      "Jane Rivers",
    );
    await sayNoMinors(user);
    await user.click(
      screen.getByRole("button", { name: "Complete registration" }),
    );

    const submission = lastSubmission();
    expect(submission.partyIncludesMinor).toBe("no");
    expect(submission.accompanyingAdultName).toBeUndefined();
    expect(submission.emergencyContactPhone).toBeUndefined();
  });

  // #599 put a box here; #1376 removed it. The paragraphs are a tenant slot,
  // so the whole block appears and disappears with it -- and the absent case
  // is almost every tenant.
  describe("photos and video (#1376)", () => {
    const SCOPE = [
      "We use photos and video from our events in our own newsletters, on this site, and on our social media accounts.",
      "Registering for one of our events means you are happy for us to do that. Tell any organizer if you would rather we did not.",
    ];

    // Structurally typed for the reason `sayNoMinors` above is: the default
    // export and what `userEvent.setup()` returns are different types, and
    // both get passed here.
    async function fillAndSubmit(
      user: {
        click: (element: Element) => Promise<unknown>;
        type: (element: Element, text: string) => Promise<unknown>;
      } = userEvent,
    ) {
      await user.type(screen.getByLabelText(/^Name/), "Jane");
      await user.type(screen.getByLabelText(/^Email/), "jane@example.com");
      await sayNoMinors(user);
      await user.click(
        screen.getByRole("button", { name: "Complete registration" }),
      );
    }

    test("says nothing, and posts nothing, when the tenant has written none", async () => {
      render(<EventRegistrationForm eventId="event-1" />);

      expect(screen.queryByRole("checkbox")).toBeNull();
      expect(
        screen.queryByRole("heading", { name: PHOTO_CONSENT_HEADING }),
      ).toBeNull();
      await fillAndSubmit();

      expect(lastSubmission().photoConsent).toBeUndefined();
    });

    test("renders the paragraphs, with no box of its own", async () => {
      render(<EventRegistrationForm eventId="event-1" photoConsent={SCOPE} />);

      expect(
        screen.getByRole("heading", { name: PHOTO_CONSENT_HEADING }),
      ).toBeInTheDocument();
      for (const paragraph of SCOPE) {
        expect(screen.getByText(paragraph)).toBeInTheDocument();
      }

      // No waiver here, so the form carries no checkbox at all.
      expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    });

    // With a waiver in force the only box on the form is its own. #599's box
    // sat beside it and #1376 removed it, so a test that merely counted
    // "at least one" would not notice it coming back.
    test("the only checkbox on the form is the waiver's", () => {
      render(
        <EventRegistrationForm
          eventId="event-1"
          photoConsent={SCOPE}
          waiver={{ version: 1, title: "Participant Waiver" }}
          waiverBlock={<p>The agreement itself.</p>}
        />,
      );

      const boxes = screen.getAllByRole("checkbox");
      expect(boxes).toHaveLength(1);
      expect(boxes[0]).toHaveAccessibleName(
        "I have read and accept the Participant Waiver",
      );
    });

    // The wire guard, and the point of the whole change: a registration taken
    // through this form records nothing about photos, so the row rests at
    // null -- no objection on record, agreement implied by registering.
    test("posts no photoConsent field even with paragraphs written", async () => {
      render(<EventRegistrationForm eventId="event-1" photoConsent={SCOPE} />);

      await fillAndSubmit();

      expect(registerForEventActionMock).toHaveBeenCalled();
      expect(lastSubmission().photoConsent).toBeUndefined();
      for (const key of Object.keys(lastSubmission())) {
        expect(key).not.toMatch(/photo/i);
      }
    });

    // #1376 dropped the guardian branch with the box it reworded: a
    // platform-written sentence saying a registering adult's submission binds
    // the under-18s in their party would be a guardianship claim the platform
    // is in no position to make.
    test("says nothing about a guardian capacity when the party includes a minor", async () => {
      const user = userEvent.setup();
      render(<EventRegistrationForm eventId="event-1" photoConsent={SCOPE} />);

      await user.click(screen.getByLabelText(/under 18/i));
      await user.click(screen.getByRole("option", { name: "Yes" }));

      expect(screen.queryByText(/parent or guardian/i)).toBeNull();
    });

    // #789's order of accumulation, now two notices and then the one
    // agreement the form actually takes.
    test("sits between the privacy notice and the agreement", () => {
      const { container } = render(
        <EventRegistrationForm
          eventId="event-1"
          photoConsent={SCOPE}
          waiver={{ version: 1, title: "Participant Waiver" }}
          waiverBlock={<p>The agreement itself.</p>}
        />,
      );

      const text = container.textContent ?? "";
      const notice = text.indexOf("We use what you enter here");
      const photos = text.indexOf(PHOTO_CONSENT_HEADING);
      const agreement = text.indexOf("I have read and accept");

      expect(notice).toBeGreaterThanOrEqual(0);
      expect(photos).toBeGreaterThan(notice);
      expect(agreement).toBeGreaterThan(photos);
    });
  });
});
