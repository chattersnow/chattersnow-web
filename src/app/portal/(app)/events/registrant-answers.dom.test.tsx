// #1501: staff editing a registration's answers from the detail sheet.
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RegistrationQuestion } from "@/lib/registration-questions";

type ActionResult =
  { error: { code: string; message: string } } | { success: true };

mock.module("server-only", () => ({}));
const RegistrantsActions = await import("./registrants-actions");

const setAnswersMock = mock<
  (id: string, answers: Record<string, unknown>) => Promise<ActionResult>
>(async () => ({ success: true }));

mock.module("./registrants-actions", () => ({
  ...RegistrantsActions,
  setRegistrationAnswersAction: setAnswersMock,
}));

mock.module("@/components/ui/toast", () => ({
  toast: { error: mock(() => ""), success: mock(() => ""), close: mock() },
  Toaster: () => null,
}));

const { RegistrantAnswers } = await import("./registrant-answers");

const LEAVING_FROM: RegistrationQuestion = {
  id: "q-leaving",
  kind: "short_text",
  prompt: "Leaving from",
  help: null,
  required: true,
  options: [],
  min_value: null,
  max_value: null,
  show_if: null,
};
const SEATS: RegistrationQuestion = {
  ...LEAVING_FROM,
  id: "q-seats",
  kind: "number",
  prompt: "Seats available",
  required: false,
  min_value: 1,
  max_value: 6,
};

describe("RegistrantAnswers", () => {
  beforeEach(() => {
    setAnswersMock.mockClear();
    setAnswersMock.mockResolvedValue({ success: true });
  });

  test("saves edited answers, required or not", async () => {
    const onSaved = mock(() => {});
    const user = userEvent.setup();
    render(
      <RegistrantAnswers
        registrationId="reg-1"
        questions={[LEAVING_FROM, SEATS]}
        answers={[
          {
            question_id: "q-leaving",
            prompt_as_shown: "Leaving from",
            answer_text: "Burlington",
            sort_order: 0,
            value: "Burlington",
          },
        ]}
        canManage
        onSaved={onSaved}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit answers" }));
    const leaving = screen.getByLabelText("Leaving from");
    expect(leaving).toHaveValue("Burlington");
    // Staff may clear a required answer.
    await user.clear(leaving);
    await user.type(screen.getByLabelText("Seats available"), "3");
    await user.click(screen.getByRole("button", { name: "Save answers" }));

    expect(setAnswersMock).toHaveBeenCalledWith("reg-1", { "q-seats": 3 });
    expect(onSaved).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Save answers" })).toBeNull();
  });

  test("refuses an out-of-range number before the round trip", async () => {
    const user = userEvent.setup();
    render(
      <RegistrantAnswers
        registrationId="reg-1"
        questions={[SEATS]}
        answers={[]}
        canManage
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit answers" }));
    await user.type(screen.getByLabelText("Seats available"), "9");
    await user.click(screen.getByRole("button", { name: "Save answers" }));

    expect(
      screen.getByText(
        "“Seats available” needs a whole number between 1 and 6.",
      ),
    ).toBeInTheDocument();
    expect(setAnswersMock).not.toHaveBeenCalled();
  });

  test("a refused save stays open and says why", async () => {
    setAnswersMock.mockResolvedValue({
      error: {
        code: "conflict",
        message: "That registration no longer exists.",
      },
    });
    const user = userEvent.setup();
    render(
      <RegistrantAnswers
        registrationId="reg-1"
        questions={[LEAVING_FROM]}
        answers={[]}
        canManage
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit answers" }));
    await user.type(screen.getByLabelText("Leaving from"), "Stowe");
    await user.click(screen.getByRole("button", { name: "Save answers" }));

    expect(
      await screen.findByText("That registration no longer exists."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save answers" }),
    ).toBeInTheDocument();
  });
});
