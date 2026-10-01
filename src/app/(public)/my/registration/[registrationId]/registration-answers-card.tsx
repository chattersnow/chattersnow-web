"use client";

import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { RegistrationQuestionsFields } from "@/components/registration-questions-fields";
import {
  answersError,
  answersToDraft,
  draftToAnswers,
  missingRequiredQuestions,
  visibleQuestions,
  type RegistrationAnswers,
  type RegistrationQuestion,
} from "@/lib/registration-questions";
import { setMyAnswersAction } from "./registration-answers-actions";

/**
 * Your answers to the event's registration questions (#1501), and the one
 * place a registrant can change them. Editable while registration is open;
 * after that read-only, because the organizer is working from them.
 *
 * It is also how somebody who registered before the questions were added
 * completes them, so a required question they have not answered is called out
 * above the form rather than left for them to notice.
 */
export function RegistrationAnswersCard({
  registrationId,
  questions,
  initialAnswers,
  answerTexts,
  editable,
}: {
  registrationId: string;
  questions: RegistrationQuestion[];
  initialAnswers: RegistrationAnswers;
  /**
   * Question id -> the stored answer in the words it was given in. What the
   * read-only view shows, so an option renamed since reads as it was chosen.
   */
  answerTexts: Record<string, string>;
  editable: boolean;
}) {
  const [draft, setDraft] = useState(() =>
    answersToDraft(questions, initialAnswers),
  );
  const [saved, setSaved] = useState(initialAnswers);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const answers = draftToAnswers(questions, draft);
  const dirty = JSON.stringify(answers) !== JSON.stringify(saved);
  const missing = missingRequiredQuestions(questions, saved);

  function handleSave() {
    setError(null);
    setMessage(null);
    const problem = answersError(questions, answers);
    if (problem) {
      setError(problem.message);
      return;
    }
    startTransition(async () => {
      const result = await setMyAnswersAction(registrationId, answers);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSaved(answers);
      setMessage("Saved.");
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <h2 className="text-base font-medium">Your answers</h2>
        {editable ? (
          <>
            {missing.length > 0 && (
              <Alert>
                <AlertDescription>
                  {missing.length === 1
                    ? "This event asks a question you haven't answered yet. Please answer it below and save."
                    : `This event asks ${missing.length} questions you haven't answered yet. Please answer them below and save.`}
                </AlertDescription>
              </Alert>
            )}
            <FieldGroup>
              <RegistrationQuestionsFields
                idPrefix="my-registration-answers"
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
            <div className="flex items-center gap-3">
              <Button
                type="button"
                onClick={handleSave}
                disabled={isPending || !dirty}
              >
                {isPending ? "Saving…" : "Save"}
              </Button>
              {message && (
                <p className="app-muted text-sm" role="status">
                  {message}
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <dl className="flex flex-col gap-2 text-sm">
              {visibleQuestions(questions, saved).map((question) => (
                <div key={question.id}>
                  <dt className="font-medium">{question.prompt}</dt>
                  <dd className={answerTexts[question.id] ? "" : "app-muted"}>
                    {answerTexts[question.id] ?? "Not answered"}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="app-muted text-sm">
              Registration has closed, so these can&apos;t be changed here. Get
              in touch if something is wrong.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
