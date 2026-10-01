// #1502: the page behind an emailed answers link. The token travels in the
// form, the answers are held to the registration rules before they leave, and
// a link that has died since the page loaded says so in place of the form.
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RegistrationQuestion } from "@/lib/registration-questions";

type Result = { error: string; linkInvalid?: boolean } | { success: true };

const submitAnswersByLinkActionMock = mock<
  (formData: FormData) => Promise<Result>
>(async () => ({ success: true }));

mock.module("./actions", () => ({
  submitAnswersByLinkAction: submitAnswersByLinkActionMock,
}));

const { AnswersForm } = await import("./answers-form");
const { ANSWER_LINK_INVALID } =
  await import("@/lib/registration-answer-requests");

const TOKEN = "a".repeat(64);

const questions: RegistrationQuestion[] = [
  {
    id: "q-from",
    kind: "short_text",
    prompt: "Leaving from",
    help: null,
    required: true,
    options: [],
    min_value: null,
    max_value: null,
    show_if: null,
  },
];

beforeEach(() => {
  submitAnswersByLinkActionMock.mockClear();
});

describe("AnswersForm", () => {
  test("sends the token in the form with the answers", async () => {
    render(
      <AnswersForm token={TOKEN} questions={questions} initialAnswers={{}} />,
    );
    expect(
      screen.getByText("One question still needs an answer."),
    ).toBeInTheDocument();

    await userEvent.type(
      screen.getByRole("textbox", { name: /Leaving from/ }),
      "Denver",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save answers" }));

    expect(submitAnswersByLinkActionMock).toHaveBeenCalledTimes(1);
    const [formData] = submitAnswersByLinkActionMock.mock.calls[0];
    expect(formData.get("t")).toBe(TOKEN);
    expect(JSON.parse(String(formData.get("registrationAnswers")))).toEqual({
      "q-from": "Denver",
    });
    expect(
      await screen.findByText(/your answers are saved/),
    ).toBeInTheDocument();
  });

  test("a required question left blank is refused before it is sent", async () => {
    render(
      <AnswersForm
        token={TOKEN}
        questions={questions}
        initialAnswers={{ "q-from": "Boulder" }}
      />,
    );
    await userEvent.clear(
      screen.getByRole("textbox", { name: /Leaving from/ }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save answers" }));

    expect(submitAnswersByLinkActionMock).not.toHaveBeenCalled();
  });

  test("a link that died since the page loaded replaces the form", async () => {
    submitAnswersByLinkActionMock.mockImplementationOnce(async () => ({
      error: ANSWER_LINK_INVALID,
      linkInvalid: true,
    }));
    render(
      <AnswersForm token={TOKEN} questions={questions} initialAnswers={{}} />,
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: /Leaving from/ }),
      "Denver",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save answers" }));

    expect(await screen.findByText(ANSWER_LINK_INVALID)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save answers" }),
    ).not.toBeInTheDocument();
  });
});
