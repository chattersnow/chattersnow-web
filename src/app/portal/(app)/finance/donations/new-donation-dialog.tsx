"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDonationAction } from "./actions";
import {
  DonationFormFields,
  emptyDonationForm,
  packDonationFormData,
  type DonationFormState,
} from "./donation-form-fields";
import type { EventOption } from "./donations-shared";
import { listPeopleAction, type PersonListItem } from "../../people/actions";
import { listEventOptionsAction } from "../../events/actions";
import type { PickedPerson } from "../../people/person-picker";
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
import {
  useControlledOpen,
  type ControlledOpenProps,
} from "@/components/portal/use-controlled-open";

export function NewDonationDialog({
  events,
  people,
  triggerLabel = "New donation",
  open: controlledOpen,
  onOpenChange,
  withTrigger = true,
}: {
  events?: EventOption[];
  people?: PersonListItem[];
  triggerLabel?: string;
} & ControlledOpenProps) {
  const router = useRouter();
  const [open, setOpen] = useControlledOpen(controlledOpen, onOpenChange);
  const [form, setForm] = useState<DonationFormState>(() =>
    emptyDonationForm(),
  );
  // The donations page passes both option lists down from its own query; the
  // sidebar quick action has no such query, so load them on open instead.
  const [peopleOptions, setPeopleOptions] = useState<PersonListItem[]>(
    people ?? [],
  );
  const [loadedEvents, setLoadedEvents] = useState<EventOption[]>([]);
  const eventOptions = events ?? loadedEvents;
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    if (!events) {
      listEventOptionsAction().then((result) => {
        if (!("error" in result)) setLoadedEvents(result.data);
      });
    }
    if (!people) {
      listPeopleAction().then((result) => {
        if (!("error" in result)) setPeopleOptions(result.data);
      });
    }
  }, [open, events, people]);

  function update<K extends keyof DonationFormState>(
    key: K,
    value: DonationFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handlePersonCreated(person: PickedPerson) {
    setPeopleOptions((prev) => [...prev, person as PersonListItem]);
  }

  // Compared against a fresh empty form rather than tracked with a flag, so
  // typing and then clearing a field doesn't count as unsaved work.
  const baseline = emptyDonationForm();
  const dirty = (Object.keys(baseline) as (keyof DonationFormState)[]).some(
    (key) => form[key] !== baseline[key],
  );
  const guard = useUnsavedChangesGuard(dirty);

  function resetForm() {
    setForm(emptyDonationForm());
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
      const result = await createDonationAction(packDonationFormData(form));
      if ("error" in result) {
        setError(result.error);
        return;
      }
      resetForm();
      setOpen(false);
      toast.success("Donation logged.");
      router.refresh();
    });
  }

  return (
    <>
      <DiscardChangesDialog
        guard={guard}
        subject="this donation"
        onDiscard={() => {
          resetForm();
          setOpen(false);
        }}
      />
      <PortalFormSurface
        open={open}
        onOpenChange={handleOpenChange}
        withTrigger={withTrigger}
        trigger={
          <Button type="button" className="shrink-0 whitespace-nowrap">
            {triggerLabel}
          </Button>
        }
        title="Add donation"
        description="Record a monetary donation received."
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
                "Add donation"
              )}
            </Button>
          </>
        }
      >
        <FieldGroup>
          <RequiredFieldsNote />
          <DonationFormFields
            form={form}
            update={update}
            events={eventOptions}
            people={peopleOptions}
            onPersonCreated={handlePersonCreated}
            idPrefix="new-donation"
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
