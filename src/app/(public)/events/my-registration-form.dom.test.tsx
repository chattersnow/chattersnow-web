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

/**
 * #685: the minors question is required here exactly as it is on the anonymous
 * form, so every case that expects a submission has to answer it.
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
// #686. The signed-in path takes the same agreement the anonymous one does:
// holding an account is not agreement to anything, and a route around the box
// would be the shortest way to a registration with nothing behind it.
describe("MyEventRegistrationForm and the participant agreement", () => {
  beforeEach(() => {
    registerMyselfForEventActionMock.mockClear();
  });

  test("shows nothing when the tenant takes no agreement", () => {
    render(<MyEventRegistrationForm eventId="event-1" person={person} />);

    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  test("starts unticked and posts the version it was shown", async () => {
    render(
      <MyEventRegistrationForm
        eventId="event-1"
        person={person}
        waiver={{ version: 7 }}
        waiverBlock={<p>The agreement itself</p>}
      />,
    );

    expect(screen.getByText("The agreement itself")).toBeVisible();
    const box = screen.getByRole("checkbox", { name: /I have read the/ });
    expect(box).not.toBeChecked();

    await userEvent.click(box);
    await sayNoMinors();
    await userEvent.click(
      screen.getByRole("button", { name: "Complete registration" }),
    );

    expect(lastSubmission()).toMatchObject({
      waiverAccepted: "on",
      waiverVersion: "7",
    });
  });
});

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

    await sayNoMinors(user);
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
    await sayNoMinors(user);
    await user.click(
      screen.getByRole("button", { name: "Complete registration" }),
    );

    expect(lastSubmission().attendedBefore).toBe("yes");
  });
});

// #685. An account says who is registering and nothing about who is coming
// with them, so this path asks the same question and collects the same four
// contacts. A route around it would be the easy way to a registration with a
// child on it and no adult named.
describe("MyEventRegistrationForm and the minors question", () => {
  beforeEach(() => {
    registerMyselfForEventActionMock.mockClear();
  });

  test("asks it, in the same words the anonymous form uses", () => {
    render(<MyEventRegistrationForm eventId="event-1" person={person} />);

    expect(
      screen.getByLabelText(/Is anyone in your party under 18\?/),
    ).toBeVisible();
  });

  test("a yes reveals the organization's rule and posts the contacts", async () => {
    const user = userEvent.setup();
    render(
      <MyEventRegistrationForm
        eventId="event-1"
        person={person}
        minorAccompaniment={["An adult has to be with them for the whole day."]}
      />,
    );

    expect(screen.queryByLabelText(/Accompanying adult's name/i)).toBeNull();

    await user.click(screen.getByLabelText(/under 18/i));
    await user.click(screen.getByRole("option", { name: "Yes" }));

    expect(
      screen.getByText("An adult has to be with them for the whole day."),
    ).toBeVisible();

    await user.type(
      screen.getByLabelText(/Accompanying adult's name/i),
      "Jamie Rivera",
    );
    await user.type(
      screen.getByLabelText(/Accompanying adult's mobile/i),
      "555-0101",
    );
    await user.type(
      screen.getByLabelText(/Emergency contact's name/i),
      "Robin Rivera",
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
      accompanyingAdultName: "Jamie Rivera",
      emergencyContactPhone: "555-0102",
    });
  });
});

// #599. Put to a signed-in caller exactly as it is to an anonymous one:
// holding an account is not permission to photograph anybody.
describe("MyEventRegistrationForm and photo consent", () => {
  const SCOPE = [
    "We use photos and video from our events in our own newsletters, on this site, and on our social media accounts.",
  ];

  beforeEach(() => {
    registerMyselfForEventActionMock.mockClear();
  });

  test("asks nothing, and posts nothing, when the tenant has written no scope", async () => {
    render(<MyEventRegistrationForm eventId="event-1" person={person} />);

    expect(screen.queryByRole("checkbox")).toBeNull();
    await sayNoMinors();
    await userEvent.click(
      screen.getByRole("button", { name: "Complete registration" }),
    );

    expect(lastSubmission().photoConsent).toBeUndefined();
  });

  test("an unticked box that was on screen posts a decline, and still registers", async () => {
    render(
      <MyEventRegistrationForm
        eventId="event-1"
        person={person}
        photoConsent={SCOPE}
      />,
    );

    const box = screen.getByRole("checkbox", {
      name: /happy to be photographed/i,
    });
    expect(box).not.toBeChecked();

    await sayNoMinors();
    await userEvent.click(
      screen.getByRole("button", { name: "Complete registration" }),
    );

    expect(lastSubmission().photoConsent).toBe("off");
    expect(registerMyselfForEventActionMock).toHaveBeenCalled();
  });

  test("a ticked box posts consent", async () => {
    const user = userEvent.setup();
    render(
      <MyEventRegistrationForm
        eventId="event-1"
        person={person}
        photoConsent={SCOPE}
      />,
    );

    await user.click(
      screen.getByRole("checkbox", { name: /happy to be photographed/i }),
    );
    await sayNoMinors(user);
    await user.click(
      screen.getByRole("button", { name: "Complete registration" }),
    );

    expect(lastSubmission().photoConsent).toBe("on");
  });
});
