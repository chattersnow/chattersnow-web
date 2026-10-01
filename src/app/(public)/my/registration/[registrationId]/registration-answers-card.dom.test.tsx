import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  RegistrationAnswers,
  RegistrationQuestion,
} from "@/lib/registration-questions";

type SetMyAnswersResult = { error: string } | { success: true };

const setMyAnswersActionMock = mock<
  (
    registrationId: string,
    answers: RegistrationAnswers,
  ) => Promise<SetMyAnswersResult>
>(async () => ({ success: true }));

mock.module("./registration-answers-actions", () => ({
  setMyAnswersAction: setMyAnswersActionMock,
}));

const { RegistrationAnswersCard } = await import("./registration-answers-card");

const question = (
  fields: Partial<RegistrationQuestion> &
    Pick<RegistrationQuestion, "id" | "kind" | "prompt">,
): RegistrationQuestion => ({
  help: null,
  required: false,
  options: [],
  min_value: null,
  max_value: null,
  show_if: null,
  ...fields,
});

const questions: RegistrationQuestion[] = [
  question({
    id: "q-from",
    kind: "short_text",
    prompt: "Leaving from",
    required: true,
  }),
  question({
    id: "q-seats",
    kind: "number",
    prompt: "Seats available",
    min_value: 1,
    max_value: 8,
  }),
  question({
    id: "q-share",
    kind: "consent",
    prompt: "OK to share my name and contact with the partner",
  }),
];

function renderCard(
  props: Partial<Parameters<typeof RegistrationAnswersCard>[0]> = {},
) {
  return render(
    <RegistrationAnswersCard
      registrationId="reg-1"
      questions={questions}
      initialAnswers={{}}
      answerTexts={{}}
      editable
      {...props}
    />,
  );
}

describe("RegistrationAnswersCard", () => {
  beforeEach(() => {
    setMyAnswersActionMock.mockClear();
    setMyAnswersActionMock.mockImplementation(async () => ({ success: true }));
  });

  test("says so when a required question has not been answered", () => {
    renderCard();
    expect(
      screen.getByText(/asks a question you haven't answered yet/),
    ).toBeTruthy();
  });

  test("says nothing about missing answers once they are all in", () => {
    renderCard({
      initialAnswers: { "q-from": "Burlington" },
      answerTexts: { "q-from": "Burlington" },
    });
    expect(screen.queryByText(/haven't answered yet/)).toBeNull();
    expect(
      (screen.getByLabelText(/Leaving from/) as HTMLInputElement).value,
    ).toBe("Burlington");
  });

  test("refuses a required question left blank before the round trip", async () => {
    renderCard();
    // The unticked consent box counts as an answer, so Save is live.
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Please answer “Leaving from”.")).toBeTruthy();
    expect(setMyAnswersActionMock).not.toHaveBeenCalled();
  });

  test("saves the whole set, with an unticked consent box as no", async () => {
    renderCard();
    await userEvent.type(screen.getByLabelText(/Leaving from/), "Burlington");
    await userEvent.type(screen.getByLabelText(/Seats available/), "3");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(setMyAnswersActionMock).toHaveBeenCalledWith("reg-1", {
      "q-from": "Burlington",
      "q-seats": 3,
      "q-share": false,
    });
    expect(await screen.findByText("Saved.")).toBeTruthy();
    expect(screen.queryByText(/haven't answered yet/)).toBeNull();
  });

  test("shows the server's refusal", async () => {
    setMyAnswersActionMock.mockImplementation(async () => ({
      error: "Registration for this event is closed.",
    }));
    renderCard();
    await userEvent.type(screen.getByLabelText(/Leaving from/), "Burlington");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Registration for this event is closed."),
    ).toBeTruthy();
  });

  test("reads back the stored words once registration has closed", () => {
    renderCard({
      editable: false,
      initialAnswers: { "q-from": "Burlington", "q-share": true },
      answerTexts: { "q-from": "Burlington", "q-share": "Yes" },
    });
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.getByText("Burlington")).toBeTruthy();
    expect(screen.getByText("Yes")).toBeTruthy();
    expect(screen.getByText("Not answered")).toBeTruthy();
    expect(screen.getByText(/Registration has closed/)).toBeTruthy();
  });
});
