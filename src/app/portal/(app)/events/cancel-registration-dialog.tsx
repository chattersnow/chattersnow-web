"use client";

import { FormEvent, useState, useTransition } from "react";
import {
  cancelRegistrationAction,
  type EventRegistrant,
} from "./registrants-actions";
import {
  CANCELLATION_NOTE_MAX,
  CANCELLATION_REASONS,
  CANCELLATION_REASON_LABELS,
  cancellationReasonLabel,
  type CancellationReason,
} from "@/lib/registration-cancellation";
import { runAction } from "@/components/portal/action-toast";
import { PortalFormSurface } from "@/components/portal/portal-form-surface";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

/**
 * Cancel a registration from the Registrants tab (#1418). The row stays and
 * can be restored from "Show cancelled"; its seats, option counts and unsent
 * discount code are released.
 */
export function CancelRegistrationDialog({
  registrant,
  orgEmailEnabled,
  open,
  onOpenChange,
  onCancelled,
}: {
  registrant: EventRegistrant;
  orgEmailEnabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancelled: () => void;
}) {
  const [reason, setReason] = useState<CancellationReason>("not_attending");
  const [note, setNote] = useState("");
  const canEmail = orgEmailEnabled && registrant.email.trim() !== "";
  const [notify, setNotify] = useState(canEmail);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      await runAction(
        () =>
          cancelRegistrationAction({
            registrationId: registrant.id,
            reason,
            note,
            notify: canEmail && notify,
          }),
        {
          success: `Cancelled ${registrant.name}'s registration.`,
          onError: setError,
          onSuccess: () => {
            onOpenChange(false);
            onCancelled();
          },
        },
      );
    });
  }

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={onOpenChange}
      title="Cancel registration"
      description={
        <>
          {registrant.name}&apos;s place
          {registrant.party_size > 1
            ? ` (party of ${registrant.party_size})`
            : ""}{" "}
          is released. The registration stays on record under Show cancelled,
          where it can be restored.
        </>
      }
      onSubmit={handleSubmit}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Keep registration
          </Button>
          <Button type="submit" variant="destructive" disabled={isPending}>
            {isPending ? (
              <>
                <Spinner /> Cancelling...
              </>
            ) : (
              "Cancel registration"
            )}
          </Button>
        </>
      }
    >
      <FieldGroup>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Field>
          <FieldLabel htmlFor="cancel-registration-reason">Reason</FieldLabel>
          <Select
            value={reason}
            onValueChange={(value) => setReason(value as CancellationReason)}
          >
            <SelectTrigger id="cancel-registration-reason" className="w-full">
              <SelectValue>
                {(value: string) => cancellationReasonLabel(value)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {CANCELLATION_REASONS.map((value) => (
                <SelectItem key={value} value={value}>
                  {CANCELLATION_REASON_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="cancel-registration-note">
            Note (optional)
          </FieldLabel>
          <Textarea
            id="cancel-registration-note"
            value={note}
            maxLength={CANCELLATION_NOTE_MAX}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
        <Field orientation="horizontal">
          <Checkbox
            id="cancel-registration-notify"
            checked={canEmail && notify}
            disabled={!canEmail}
            onCheckedChange={(checked) => setNotify(Boolean(checked))}
          />
          <FieldLabel htmlFor="cancel-registration-notify">
            Email {registrant.name} that it&apos;s cancelled
          </FieldLabel>
        </Field>
        {!canEmail && (
          <FieldDescription>
            {orgEmailEnabled
              ? "This registration has no email address."
              : "Outbound email is switched off for this organization."}
          </FieldDescription>
        )}
      </FieldGroup>
    </PortalFormSurface>
  );
}
