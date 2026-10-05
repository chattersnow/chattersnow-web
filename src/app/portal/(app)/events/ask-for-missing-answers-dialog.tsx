"use client";

import { useId, useMemo, useState, useTransition, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  PortalFormSurface,
  PortalFormSurfaceClose,
} from "@/components/portal/portal-form-surface";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
  useControlledOpen,
  type ControlledOpenProps,
} from "@/components/portal/use-controlled-open";
import type { RegistrationQuestion } from "@/lib/registration-questions";
import {
  ANSWER_REQUEST_ERRORS,
  answersRequestSubject,
  defaultAnswersRequestIntro,
  describeAnswerRequests,
  MAX_ANSWERS_REQUEST_INTRO_LENGTH,
  resolveAnswerRequests,
  type AnswerRequestCandidate,
} from "@/lib/registration-answer-requests";
import { askForMissingAnswersAction } from "./registrants-actions";

/**
 * Email everybody still missing a required answer their own link to fill it
 * in (#1502), beside "Message registrants".
 *
 * The count is resolved here and again in the action from the same pure
 * function, for the announcement composer's reason: the browser's copy makes
 * the number honest, the server's makes it safe. The dialog sends the event
 * and a checkbox, never a list of people.
 */
export function AskForMissingAnswersDialog({
  eventId,
  eventName,
  registrations,
  questions,
  disabledReason,
  onSent,
  open: controlledOpen,
  onOpenChange,
  withTrigger,
}: ControlledOpenProps & {
  eventId: string;
  eventName: string;
  /** The tab's own active list, so the count matches what is on screen. */
  registrations: readonly AnswerRequestCandidate[];
  questions: readonly RegistrationQuestion[];
  /** Set when nothing can be sent: org email is switched off. */
  disabledReason?: string;
  onSent?: () => void;
}) {
  const fieldId = useId();
  const [open, setOpen] = useControlledOpen(controlledOpen, onOpenChange);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Half of each recipient's dedupe key; see AnnounceToRegistrantsDialog.
  const [batchId, setBatchId] = useState(() => crypto.randomUUID());
  const [includeRecent, setIncludeRecent] = useState(false);
  const [intro, setIntro] = useState(() =>
    defaultAnswersRequestIntro(eventName),
  );
  // Resolved against the moment the dialog opened rather than every render,
  // so the count does not move under the staffer while they read it.
  const [openedAt, setOpenedAt] = useState(() => Date.now());

  const resolved = useMemo(
    () =>
      resolveAnswerRequests(registrations, questions, {
        includeRecent,
        now: openedAt,
      }),
    [registrations, questions, includeRecent, openedAt],
  );
  const count = resolved.recipients.length;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setError(null);
      setBatchId(crypto.randomUUID());
      setIncludeRecent(false);
      setIntro(defaultAnswersRequestIntro(eventName));
      setOpenedAt(Date.now());
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await askForMissingAnswersAction({
        batchId,
        eventId,
        includeRecent,
        intro,
      });
      if ("error" in result) {
        setError(result.error);
        setBatchId(crypto.randomUUID());
        return;
      }
      toast.success(
        `Sending to ${result.recipients} ${result.recipients === 1 ? "registrant" : "registrants"}.`,
        {
          description:
            "Each one shows “Asked” now. A send that fails is listed in that registrant's messages and their link is withdrawn.",
        },
      );
      setOpen(false);
      onSent?.();
    });
  }

  const trigger = (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={Boolean(disabledReason)}
    >
      Ask for missing answers
    </Button>
  );

  if (disabledReason) {
    return (
      <div className="flex flex-col gap-1">
        {trigger}
        <p className="app-muted text-xs">{disabledReason}</p>
      </div>
    );
  }

  const introTrimmed = intro.trim();
  const canSend =
    count > 0 &&
    introTrimmed.length > 0 &&
    intro.length <= MAX_ANSWERS_REQUEST_INTRO_LENGTH;

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      withTrigger={withTrigger}
      trigger={trigger}
      title="Ask for missing answers"
      description="Each registrant gets their own link to answer this event's questions — no account needed."
      onSubmit={handleSubmit}
      footer={
        <>
          <PortalFormSurfaceClose
            render={<Button type="button" variant="secondary" />}
          >
            Cancel
          </PortalFormSurfaceClose>
          <Button type="submit" disabled={isPending || !canSend}>
            {isPending ? <Spinner /> : null}
            {count > 0
              ? `Send to ${count} ${count === 1 ? "registrant" : "registrants"}`
              : "Send"}
          </Button>
        </>
      }
    >
      <div className="py-2">
        <FieldGroup>
          <p className="text-sm" role="status">
            {describeAnswerRequests(resolved)}
          </p>

          <Field orientation="horizontal">
            <Checkbox
              id={`${fieldId}-recent`}
              checked={includeRecent}
              onCheckedChange={(checked) => setIncludeRecent(checked === true)}
            />
            <FieldLabel htmlFor={`${fieldId}-recent`} className="font-normal">
              Include anyone asked in the last 24 hours
            </FieldLabel>
          </Field>

          <section
            aria-label="Email preview"
            className="flex flex-col gap-3 rounded-lg border p-3 text-sm"
          >
            <p>
              <span className="app-muted">Subject: </span>
              {answersRequestSubject(eventName)}
            </p>
            <p className="app-muted">Hi [first name],</p>
            <Field>
              <FieldLabel htmlFor={`${fieldId}-intro`} required>
                Message
              </FieldLabel>
              <Textarea
                id={`${fieldId}-intro`}
                name="intro"
                required
                rows={4}
                maxLength={MAX_ANSWERS_REQUEST_INTRO_LENGTH}
                value={intro}
                onChange={(event) => setIntro(event.target.value)}
              />
              <FieldDescription>
                {`${intro.length} / ${MAX_ANSWERS_REQUEST_INTRO_LENGTH} characters.`}
              </FieldDescription>
            </Field>
            <p className="font-medium underline">Answer the questions</p>
            <p className="app-muted text-xs">
              The link is each registrant&apos;s own. It shows only the event
              name, their first name and this event&apos;s questions, and works
              until the event ends.
            </p>
          </section>

          {count === 0 ? (
            <Alert>
              <AlertDescription>
                {ANSWER_REQUEST_ERRORS.NO_RECIPIENTS}
              </AlertDescription>
            </Alert>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </FieldGroup>
      </div>
    </PortalFormSurface>
  );
}
