"use client";

import { useEffect, useState } from "react";
import {
  draftToAnswers,
  type AnswerDraft,
  type RegistrationAnswers,
  type RegistrationQuestion,
} from "@/lib/registration-questions";
import { listEventRegistrationQuestionsAction } from "./registrants-actions";

/**
 * The event's registration questions (#1501) for the add-registrant and
 * walk-in dialogs, loaded when one opens. Empty until they arrive and for an
 * event that asks none.
 */
export function useRegistrationQuestions(
  eventId: string,
  open: boolean,
): RegistrationQuestion[] {
  const [questions, setQuestions] = useState<RegistrationQuestion[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listEventRegistrationQuestionsAction(eventId).then((result) => {
      if (cancelled || "error" in result) return;
      setQuestions(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [eventId, open]);

  return questions;
}

/**
 * A staff dialog's draft as the action takes it, or null when nothing was
 * answered. An unticked consent box alone is not an answer here: staff who
 * left every field alone did not ask, and recording "no" for them would say
 * the registrant declined.
 */
export function staffAnswersFromDraft(
  questions: readonly RegistrationQuestion[],
  draft: AnswerDraft,
): RegistrationAnswers | null {
  if (questions.length === 0) return null;
  const answers = draftToAnswers(questions, draft);
  return Object.values(answers).some((value) => value !== false)
    ? answers
    : null;
}
