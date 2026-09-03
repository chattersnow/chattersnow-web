"use client";

import {
  FormEvent,
  Ref,
  useEffect,
  useImperativeHandle,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { updateEventPlanningAction } from "./actions";
import type { EventRow } from "./event-badges";
import { PersonPicker, type PickedPerson } from "../people/person-picker";
import { listPeopleAction, type PersonListItem } from "../people/actions";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useTabData } from "@/hooks/use-tab-data";
import { datetimeLocalToUtcIso, utcIsoToDatetimeLocalInZone } from "@/lib/time";
import { formatCurrency, formatDateTime } from "@/lib/format";

function toDatetimeLocalValue(iso: string | null, timezone: string) {
  if (!iso) return "";
  return utcIsoToDatetimeLocalInZone(iso, timezone);
}

function formStateFor(event: EventRow) {
  return {
    eventLead: event.event_lead,
    capacity: event.capacity === null ? "" : String(event.capacity),
    registrationEnabled: event.registration_enabled,
    registrationDeadline: toDatetimeLocalValue(
      event.registration_deadline,
      event.timezone,
    ),
    autoAssignDiscountCodes: event.auto_assign_discount_codes,
    budgetAmount:
      event.budget_amount === null ? "" : String(event.budget_amount),
  };
}

type FormState = ReturnType<typeof formStateFor>;

function isDirty(form: FormState, event: EventRow) {
  const baseline = formStateFor(event);
  return (Object.keys(baseline) as (keyof FormState)[]).some((key) => {
    if (key === "eventLead") {
      return (form.eventLead?.id ?? null) !== (baseline.eventLead?.id ?? null);
    }
    return form[key] !== baseline[key];
  });
}

export type PlanningTabHandle = {
  discard: () => void;
};

export function PlanningTab({
  event,
  formId,
  mode,
  onSaved,
  onPendingChange,
  onDirtyChange,
  ref,
}: {
  event: EventRow;
  formId: string;
  mode: "view" | "edit";
  onSaved: () => void;
  onPendingChange?: (pending: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
  ref?: Ref<PlanningTabHandle>;
}) {
  const router = useRouter();
  const [form, setForm] = useState(() => formStateFor(event));
  const { data: peopleData } = useTabData<PersonListItem[]>(
    () => listPeopleAction(),
    true,
  );
  const [newPeople, setNewPeople] = useState<PersonListItem[]>([]);
  const people = [...(peopleData ?? []), ...newPeople];
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handlePersonCreated(person: PickedPerson) {
    setNewPeople((prev) => [...prev, { ...person, is_sponsor: false }]);
  }

  useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);

  useEffect(() => {
    onDirtyChange?.(isDirty(form, event));
  }, [form, event, onDirtyChange]);

  useImperativeHandle(ref, () => ({
    discard: () => {
      setError(null);
      setForm(formStateFor(event));
    },
  }));

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("eventLeadId", form.eventLead?.id ?? "");
    formData.set("capacity", form.capacity);
    formData.set(
      "registrationEnabled",
      form.registrationEnabled ? "on" : "off",
    );
    // Parsed against the event's own timezone (not the browser's or the
    // server's) since this is a naive "YYYY-MM-DDTHH:mm" value with no
    // offset, and must round-trip consistently with `toDatetimeLocalValue`.
    const registrationDeadlineIso = form.registrationDeadline
      ? datetimeLocalToUtcIso(form.registrationDeadline, event.timezone)
      : "";
    formData.set("registrationDeadline", registrationDeadlineIso ?? "");
    formData.set(
      "autoAssignDiscountCodes",
      form.autoAssignDiscountCodes ? "on" : "off",
    );
    formData.set("budgetAmount", form.budgetAmount);

    startTransition(async () => {
      const result = await updateEventPlanningAction(event.id, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
      onSaved();
    });
  }

  const locked = event.report_status === "submitted";

  if (mode === "view" || locked) {
    return (
      <FieldGroup>
        <ReadOnlyField label="Event lead" htmlFor="planning-eventLeadId">
          {form.eventLead?.name ?? form.eventLead?.email ?? "—"}
        </ReadOnlyField>
        <Field orientation="responsive">
          <ReadOnlyField label="Capacity" htmlFor="planning-capacity">
            {form.capacity || "—"}
          </ReadOnlyField>
          <ReadOnlyField label="Budget" htmlFor="planning-budgetAmount">
            {formatCurrency(event.budget_amount)}
          </ReadOnlyField>
        </Field>
        <Field orientation="responsive">
          <ReadOnlyField
            label="Registration"
            htmlFor="planning-registrationEnabled"
          >
            {form.registrationEnabled ? "Enabled" : "Disabled"}
          </ReadOnlyField>
          <ReadOnlyField
            label="Registration deadline"
            htmlFor="planning-registrationDeadline"
          >
            {formatDateTime(event.registration_deadline)}
          </ReadOnlyField>
        </Field>
        <ReadOnlyField
          label="Auto-assign discount codes"
          htmlFor="planning-autoAssignDiscountCodes"
        >
          {form.autoAssignDiscountCodes ? "On" : "Off"}
        </ReadOnlyField>
      </FieldGroup>
    );
  }

  return (
    <form id={formId} onSubmit={handleSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="planning-eventLeadId">Event lead</FieldLabel>
          <PersonPicker
            people={people}
            selected={form.eventLead}
            onSelect={(person) => update("eventLead", person)}
            onPersonCreated={handlePersonCreated}
          />
        </Field>

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="planning-capacity">Capacity</FieldLabel>
            <Input
              id="planning-capacity"
              type="number"
              min={0}
              step={1}
              value={form.capacity}
              onChange={(changeEvent) =>
                update("capacity", changeEvent.target.value)
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="planning-budgetAmount">Budget ($)</FieldLabel>
            <Input
              id="planning-budgetAmount"
              type="number"
              min="0"
              step="0.01"
              value={form.budgetAmount}
              onChange={(changeEvent) =>
                update("budgetAmount", changeEvent.target.value)
              }
            />
          </Field>
        </Field>

        <Field orientation="horizontal">
          <Checkbox
            id="planning-registrationEnabled"
            checked={form.registrationEnabled}
            onCheckedChange={(checked) =>
              update("registrationEnabled", Boolean(checked))
            }
          />
          <FieldLabel htmlFor="planning-registrationEnabled">
            Registration enabled
          </FieldLabel>
        </Field>

        <Field>
          <FieldLabel htmlFor="planning-registrationDeadline">
            Registration deadline
          </FieldLabel>
          <Input
            id="planning-registrationDeadline"
            type="datetime-local"
            value={form.registrationDeadline}
            onChange={(changeEvent) =>
              update("registrationDeadline", changeEvent.target.value)
            }
          />
        </Field>

        <Field orientation="horizontal">
          <Checkbox
            id="planning-autoAssignDiscountCodes"
            checked={form.autoAssignDiscountCodes}
            onCheckedChange={(checked) =>
              update("autoAssignDiscountCodes", Boolean(checked))
            }
          />
          <FieldLabel htmlFor="planning-autoAssignDiscountCodes">
            Auto-assign discount codes to new registrants
          </FieldLabel>
        </Field>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </form>
  );
}
