"use client";

import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RegistrationOptionCountsField } from "@/components/registration-option-counts-field";
import {
  optionCountsError,
  type OptionCounts,
  type RegistrationOptionsQuestion,
} from "@/lib/registration-options";
import { setMyOptionCountsAction } from "./registration-options-actions";

/**
 * Your answer to the event's registration question (#1407), and the one place
 * a registrant can change it. Editable while registration is open; after
 * that it is read-only, because the organizer is working from the numbers.
 */
export function RegistrationOptionsCard({
  registrationId,
  question,
  initialCounts,
  partySize,
  editable,
}: {
  registrationId: string;
  question: RegistrationOptionsQuestion;
  initialCounts: OptionCounts;
  partySize: number;
  editable: boolean;
}) {
  const [counts, setCounts] = useState(initialCounts);
  const [saved, setSaved] = useState(initialCounts);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const dirty = question.options.some(
    (option) => (counts[option.id] ?? 0) !== (saved[option.id] ?? 0),
  );

  function handleSave() {
    setError(null);
    setMessage(null);
    const problem = optionCountsError(counts, partySize);
    if (problem) {
      setError(problem);
      return;
    }
    startTransition(async () => {
      const result = await setMyOptionCountsAction(registrationId, counts);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSaved(counts);
      setMessage("Saved.");
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        {editable ? (
          <>
            <RegistrationOptionCountsField
              idPrefix="my-registration-options"
              question={question}
              counts={counts}
              onChange={(next) => {
                setMessage(null);
                setCounts(next);
              }}
              partySize={partySize}
              disabled={isPending}
            />
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
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">{question.prompt}</p>
            <ul className="text-sm">
              {question.options
                .filter((option) => (saved[option.id] ?? 0) > 0)
                .map((option) => (
                  <li key={option.id}>
                    {saved[option.id]} × {option.label}
                  </li>
                ))}
            </ul>
            <p className="app-muted text-sm">
              Registration has closed, so this can&apos;t be changed here. Get
              in touch if something is wrong.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
