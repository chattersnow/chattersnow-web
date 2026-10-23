"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  PortalFormSurface,
  PortalFormSurfaceClose,
} from "@/components/portal/portal-form-surface";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import {
  CARPOOL_ASSIGNMENT_ERRORS,
  resolveCarpoolAssignmentRecipients,
  type CarpoolAssignmentRecipient,
} from "@/lib/carpool-assignment";
import { emailCarpoolAssignmentsAction } from "../../carpools-actions";

/**
 * "Email carpool assignments" on the carpool board (#1651): everyone in a car
 * gets their car, driver and car-mates, the cost-split notice and their own
 * answers link -- or only those whose car changed since they were last
 * emailed, which on a first send is everyone.
 *
 * The count is resolved here and again in the action from the same pure
 * function, for #1502's reason: the browser's copy makes the number honest,
 * the server's makes it safe. The dialog sends the event and a checkbox,
 * never a list of people.
 */
export function EmailCarpoolAssignmentsDialog({
  eventId,
  recipients,
  disabledReason,
}: {
  eventId: string;
  /** Everyone in a car, from event_carpool_assignment_recipients(). */
  recipients: readonly CarpoolAssignmentRecipient[];
  /** Set when nothing can be sent: org email is switched off. */
  disabledReason?: string;
}) {
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Half of each recipient's dedupe key, so a double click sends once.
  const [batchId, setBatchId] = useState(() => crypto.randomUUID());
  const [onlyChanged, setOnlyChanged] = useState(true);

  const audience = onlyChanged ? "changed" : "everyone";
  const resolved = resolveCarpoolAssignmentRecipients(recipients, audience);
  const count = resolved.recipients.length;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setError(null);
      setBatchId(crypto.randomUUID());
      setOnlyChanged(true);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await emailCarpoolAssignmentsAction({
        eventId,
        batchId,
        audience,
      });
      if ("error" in result) {
        setError(result.error.message);
        setBatchId(crypto.randomUUID());
        return;
      }
      toast.success(
        `Sending to ${result.recipients} ${result.recipients === 1 ? "person" : "people"}.`,
        {
          description:
            "Each email is listed in that registrant's messages, including any that fail.",
        },
      );
      setOpen(false);
    });
  }

  const trigger = (
    <Button
      type="button"
      variant="secondary"
      disabled={Boolean(disabledReason)}
    >
      Email carpool assignments
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

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      trigger={trigger}
      title="Email carpool assignments"
      description="Each driver and passenger gets their car, who's driving, who else is riding, the carpool cost notice and their own link to see changes."
      onSubmit={handleSubmit}
      footer={
        <>
          <PortalFormSurfaceClose
            render={<Button type="button" variant="secondary" />}
          >
            Cancel
          </PortalFormSurfaceClose>
          <Button type="submit" disabled={isPending || count === 0}>
            {isPending ? <Spinner /> : null}
            {count > 0
              ? `Send to ${count} ${count === 1 ? "person" : "people"}`
              : "Send"}
          </Button>
        </>
      }
    >
      <div className="py-2">
        <FieldGroup>
          <Field orientation="horizontal">
            <Checkbox
              id={`${fieldId}-changed`}
              checked={onlyChanged}
              onCheckedChange={(checked) => setOnlyChanged(checked === true)}
            />
            <FieldLabel htmlFor={`${fieldId}-changed`} className="font-normal">
              Only people whose car changed since they were last emailed
            </FieldLabel>
          </Field>
          <p className="text-sm" role="status">
            {count === 1 ? "1 person" : `${count} people`} will be emailed
            {resolved.withoutAddress > 0
              ? `; ${resolved.withoutAddress} with no email address won't be.`
              : "."}
          </p>
          <p className="app-muted text-xs">
            Car-mates see each other&apos;s first name and Instagram handle,
            never a phone number, an email address, your notes or who has paid.
            The link in each email replaces any earlier one they were sent.
          </p>
          {count === 0 ? (
            <Alert>
              <AlertDescription>
                {CARPOOL_ASSIGNMENT_ERRORS.NO_RECIPIENTS}
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
