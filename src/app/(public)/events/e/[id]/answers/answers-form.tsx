"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { RegistrationQuestionsFields } from "@/components/registration-questions-fields";
import {
  answersError,
  answersToDraft,
  draftToAnswers,
  missingRequiredQuestions,
  setAnswersField,
  type RegistrationAnswers,
  type RegistrationQuestion,
} from "@/lib/registration-questions";
import { ANSWER_TOKEN_FIELD } from "@/lib/registration-answer-requests";
import { submitAnswersByLinkAction } from "./actions";

/**
 * The questions behind an emailed answers link (#1502), the same fields the
 * registration form and /my/registration render. Saved as a whole set, as
 * every answers path is, and can be saved again until the link expires.
 *
 * The token is a hidden field of the form rather than state in a URL the page
 * links to, so it leaves this page only with a save.
 */
export function AnswersForm({
  token,
  questions,
  initialAnswers,
}: {
  token: string;
  questions: RegistrationQuestion[];
  initialAnswers: RegistrationAnswers;
}) {
  const [draft, setDraft] = useState(() =>
    answersToDraft(questions, initialAnswers),
  );
  const [saved, setSaved] = useState(initialAnswers);
  const [error, setError] = useState<string | null>(null);
  const [linkInvalid, setLinkInvalid] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const answers = draftToAnswers(questions, draft);
  const dirty = JSON.stringify(answers) !== JSON.stringify(saved);
  const missing = missingRequiredQuestions(questions, saved);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const problem = answersError(questions, answers);
    if (problem) {
      setError(problem.message);
      return;
    }
    const formData = new FormData(event.currentTarget);
    setAnswersField(formData, answers);
    startTransition(async () => {
      const result = await submitAnswersByLinkAction(formData);
      if ("error" in result) {
        setError(result.error);
        setLinkInvalid(Boolean(result.linkInvalid));
        return;
      }
      setSaved(answers);
      setMessage(
        "Thank you — your answers are saved. You can come back to this link to change them.",
      );
    });
  }

  if (linkInvalid && error) {
    return (
      <Alert>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <input type="hidden" name={ANSWER_TOKEN_FIELD} value={token} />
      {missing.length > 0 && (
        <Alert>
          <AlertDescription>
            {missing.length === 1
              ? "One question still needs an answer."
              : `${missing.length} questions still need an answer.`}
          </AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <RegistrationQuestionsFields
          idPrefix="registration-answers-link"
          questions={questions}
          draft={draft}
          onChange={(next) => {
            setMessage(null);
            setDraft(next);
          }}
          disabled={isPending}
        />
      </FieldGroup>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isPending || !dirty}>
          {isPending ? "Saving…" : "Save answers"}
        </Button>
        {message && (
          <p className="app-muted text-sm" role="status">
            {message}
          </p>
        )}
      </div>
    </form>
  );
}
