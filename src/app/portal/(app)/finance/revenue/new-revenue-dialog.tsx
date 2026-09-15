"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRevenueAction } from "./actions";
import {
  RevenueFormFields,
  emptyRevenueForm,
  packRevenueFormData,
  type RevenueFormState,
} from "./revenue-form-fields";
import type { EventOption } from "./revenue-shared";
import { useEventDateDefaults } from "../../events/event-date-defaults";
import {
  DiscardChangesDialog,
  useUnsavedChangesGuard,
} from "@/components/portal/unsaved-changes-guard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  PortalFormSurface,
  PortalFormSurfaceClose,
} from "@/components/portal/portal-form-surface";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";

export function NewRevenueDialog({
  events,
  defaultEventId,
  lockEventSelection,
  triggerLabel = "New Revenue",
  onSaved,
}: {
  events: EventOption[];
  defaultEventId?: string;
  lockEventSelection?: boolean;
  triggerLabel?: string;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Inside an event, new revenue opens on the event's date rather than on
  // today; elsewhere this is "" and today stands.
  const eventDates = useEventDateDefaults();
  const [form, setForm] = useState<RevenueFormState>(() =>
    emptyRevenueForm(defaultEventId, eventDates.date),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof RevenueFormState>(
    key: K,
    value: RevenueFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Compared against a fresh empty form rather than tracked with a flag, so
  // typing and then clearing a field doesn't count as unsaved work.
  const baseline = emptyRevenueForm(defaultEventId, eventDates.date);
  const dirty = (Object.keys(baseline) as (keyof RevenueFormState)[]).some(
    (key) => form[key] !== baseline[key],
  );
  const guard = useUnsavedChangesGuard(dirty);

  function resetForm() {
    setForm(emptyRevenueForm(defaultEventId, eventDates.date));
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!guard.allowOpenChange(nextOpen)) return;
    setOpen(nextOpen);
    if (nextOpen) resetForm();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createRevenueAction(packRevenueFormData(form));
      if ("error" in result) {
        setError(result.error);
        return;
      }
      resetForm();
      setOpen(false);
      toast.success("Revenue recorded.");
      router.refresh();
      onSaved?.();
    });
  }

  return (
    <>
      <DiscardChangesDialog
        guard={guard}
        subject="this revenue entry"
        onDiscard={() => {
          resetForm();
          setOpen(false);
        }}
      />
      <PortalFormSurface
        open={open}
        onOpenChange={handleOpenChange}
        trigger={
          <Button type="button" className="shrink-0 whitespace-nowrap">
            {triggerLabel}
          </Button>
        }
        title="Add revenue"
        description="Record new event revenue."
        onSubmit={handleSubmit}
        footer={
          <>
            <PortalFormSurfaceClose
              render={<Button type="button" variant="secondary" />}
            >
              Cancel
            </PortalFormSurfaceClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Spinner /> Saving...
                </>
              ) : (
                "Add revenue"
              )}
            </Button>
          </>
        }
      >
        <FieldGroup>
          <RequiredFieldsNote />
          <RevenueFormFields
            form={form}
            update={update}
            events={events}
            lockEventSelection={lockEventSelection}
            idPrefix="new-revenue"
          />

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </FieldGroup>
      </PortalFormSurface>
    </>
  );
}
