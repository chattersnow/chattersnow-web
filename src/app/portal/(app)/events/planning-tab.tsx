"use client";

import { FormEvent, Ref, useEffect, useImperativeHandle, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { listEventLeadsAction, updateEventPlanningAction, type EventLead } from "./actions";
import type { EventRow } from "./event-badges";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function formatDatetimeLocal(value: string | null) {
  if (!value) return "—";
  return dateFormatter.format(new Date(value));
}

function toDatetimeLocalValue(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatCurrency(value: number | string | null) {
  if (value === null || value === undefined) return "—";
  const numeric = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(numeric) ? currencyFormatter.format(numeric) : "—";
}

function formStateFor(event: EventRow) {
  return {
    eventLeadId: event.event_lead_id ?? "",
    capacity: event.capacity === null ? "" : String(event.capacity),
    registrationEnabled: event.registration_enabled,
    registrationDeadline: toDatetimeLocalValue(event.registration_deadline),
    budgetAmount: event.budget_amount === null ? "" : String(event.budget_amount),
  };
}

type FormState = ReturnType<typeof formStateFor>;

function isDirty(form: FormState, event: EventRow) {
  const baseline = formStateFor(event);
  return (Object.keys(baseline) as (keyof FormState)[]).some((key) => form[key] !== baseline[key]);
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
  const [leads, setLeads] = useState<EventLead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    listEventLeadsAction().then((result) => {
      if (!("error" in result)) setLeads(result.data);
    });
  }, []);

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
    formData.set("eventLeadId", form.eventLeadId);
    formData.set("capacity", form.capacity);
    formData.set("registrationEnabled", form.registrationEnabled ? "on" : "off");
    formData.set("registrationDeadline", form.registrationDeadline);
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

  const leadEmail = leads.find((lead) => lead.user_id === form.eventLeadId)?.email;

  if (mode === "view") {
    return (
      <FieldGroup>
        <ReadOnlyField label="Event lead" htmlFor="planning-eventLeadId">
          {leadEmail ?? "—"}
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
          <ReadOnlyField label="Registration" htmlFor="planning-registrationEnabled">
            {form.registrationEnabled ? "Enabled" : "Disabled"}
          </ReadOnlyField>
          <ReadOnlyField label="Registration deadline" htmlFor="planning-registrationDeadline">
            {formatDatetimeLocal(event.registration_deadline)}
          </ReadOnlyField>
        </Field>
      </FieldGroup>
    );
  }

  return (
    <form id={formId} onSubmit={handleSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="planning-eventLeadId">Event lead</FieldLabel>
          <Select
            value={form.eventLeadId || undefined}
            onValueChange={(value) => update("eventLeadId", value ?? "")}
          >
            <SelectTrigger id="planning-eventLeadId" className="w-full">
              <SelectValue placeholder="Select an event lead">
                {() => leadEmail ?? "Select an event lead"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {leads.map((lead) => (
                <SelectItem key={lead.user_id} value={lead.user_id}>
                  {lead.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
              onChange={(changeEvent) => update("capacity", changeEvent.target.value)}
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
              onChange={(changeEvent) => update("budgetAmount", changeEvent.target.value)}
            />
          </Field>
        </Field>

        <Field orientation="horizontal">
          <Checkbox
            id="planning-registrationEnabled"
            checked={form.registrationEnabled}
            onCheckedChange={(checked) => update("registrationEnabled", Boolean(checked))}
          />
          <FieldLabel htmlFor="planning-registrationEnabled">Registration enabled</FieldLabel>
        </Field>

        <Field>
          <FieldLabel htmlFor="planning-registrationDeadline">Registration deadline</FieldLabel>
          <Input
            id="planning-registrationDeadline"
            type="datetime-local"
            value={form.registrationDeadline}
            onChange={(changeEvent) => update("registrationDeadline", changeEvent.target.value)}
          />
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
