// #1502: what "Ask for missing answers" says before it sends, and what it
// sends. Like the announcement composer, the count is on screen before the
// send and the action is handed the event and a checkbox, never a list of
// people.
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RegistrationQuestion } from "@/lib/registration-questions";
import type { AnswerRequestCandidate } from "@/lib/registration-answer-requests";

const toastSuccessMock = mock<(title: string, options?: unknown) => string>(
  () => "",
);
mock.module("@/components/ui/toast", () => ({
  toast: {
    success: toastSuccessMock,
    error: mock(() => ""),
    close: mock(() => {}),
  },
  Toaster: () => null,
}));

// Pulled in after the mock, for the reason the announcement test gives.
const askForMissingAnswersActionMock = mock<
  (input: {
    batchId: string;
    eventId: string;
    includeRecent: boolean;
    intro: string;
  }) => Promise<{ error: string } | { success: true; recipients: number }>
>(async () => ({ success: true, recipients: 1 }));
const RegistrantsActions = await import("./registrants-actions");
mock.module("./registrants-actions", () => ({
  ...RegistrantsActions,
  askForMissingAnswersAction: askForMissingAnswersActionMock,
}));

const { AskForMissingAnswersDialog } =
  await import("./ask-for-missing-answers-dialog");

const EVENT_ID = "22222222-2222-4222-8222-222222222222";

const questions: RegistrationQuestion[] = [
  {
    id: "q-getting",
    kind: "single_choice",
    prompt: "Getting there",
    help: null,
    required: true,
    options: [{ id: "ride", label: "Need a ride" }],
    min_value: null,
    max_value: null,
    show_if: null,
  },
];

function registration(
  overrides: Partial<AnswerRequestCandidate> & { id: string },
): AnswerRequestCandidate {
  return {
    name: "Jamie Rivera",
    email: `${overrides.id}@example.test`,
    person_id: null,
    answers: [],
    answer_request: null,
    ...overrides,
  };
}

const registrations = [
  registration({ id: "missing" }),
  registration({
    id: "answered",
    answers: [{ question_id: "q-getting", value: "ride" }],
  }),
  registration({
    id: "asked-recently",
    answer_request: {
      requested_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      answered_at: null,
    },
  }),
];

function renderDialog(disabledReason?: string) {
  render(
    <AskForMissingAnswersDialog
      eventId={EVENT_ID}
      eventName="Mountain Day"
      registrations={registrations}
      questions={questions}
      disabledReason={disabledReason}
    />,
  );
}

async function open() {
  await userEvent.click(
    screen.getByRole("button", { name: "Ask for missing answers" }),
  );
}

beforeEach(() => {
  askForMissingAnswersActionMock.mockClear();
  toastSuccessMock.mockClear();
});

describe("AskForMissingAnswersDialog", () => {
  test("counts only the unanswered, and leaves out anyone asked today", async () => {
    renderDialog();
    await open();

    expect(
      screen.getByText(
        "This will email 1 registrant missing a required answer; 1 was asked in the last 24 hours.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Send to 1 registrant" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("checkbox", {
        name: "Include anyone asked in the last 24 hours",
      }),
    );
    expect(
      screen.getByRole("button", { name: "Send to 2 registrants" }),
    ).toBeInTheDocument();
  });

  test("previews the subject and the link, with an editable intro", async () => {
    renderDialog();
    await open();

    expect(
      screen.getByText("A few questions about Mountain Day"),
    ).toBeInTheDocument();
    expect(screen.getByText("Answer the questions")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Message/ })).toHaveValue(
      "We've added a few questions to Mountain Day since you registered. Could you take a minute to answer them? It helps us plan the day.",
    );
  });

  test("sends the event, the checkbox and the intro, never a recipient list", async () => {
    renderDialog();
    await open();
    const intro = screen.getByRole("textbox", { name: /Message/ });
    await userEvent.clear(intro);
    await userEvent.type(intro, "Carpool questions, please.");
    await userEvent.click(
      screen.getByRole("button", { name: "Send to 1 registrant" }),
    );

    expect(askForMissingAnswersActionMock).toHaveBeenCalledTimes(1);
    const [input] = askForMissingAnswersActionMock.mock.calls[0];
    expect(input.eventId).toBe(EVENT_ID);
    expect(input.includeRecent).toBe(false);
    expect(input.intro).toBe("Carpool questions, please.");
    expect(Object.keys(input).sort()).toEqual([
      "batchId",
      "eventId",
      "includeRecent",
      "intro",
    ]);
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Sending to 1 registrant.",
      expect.anything(),
    );
  });

  test("shows a refusal and stays open", async () => {
    askForMissingAnswersActionMock.mockImplementationOnce(async () => ({
      error: "Outbound email is switched off.",
    }));
    renderDialog();
    await open();
    await userEvent.click(
      screen.getByRole("button", { name: "Send to 1 registrant" }),
    );

    expect(
      await screen.findByText("Outbound email is switched off."),
    ).toBeInTheDocument();
  });

  test("is disabled, and says why, when email is off", () => {
    renderDialog("Outbound email is switched off for this organization.");
    expect(
      screen.getByRole("button", { name: "Ask for missing answers" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Outbound email is switched off for this organization."),
    ).toBeInTheDocument();
  });
});
