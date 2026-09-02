"use client";

import { CURRENCIES, type EventOption } from "./expenses-shared";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type ExpenseFormState = {
  description: string;
  eventId: string;
  expenseDate: string;
  amount: string;
  currency: string;
  receiptUrl: string;
  notes: string;
};

export function emptyExpenseForm(defaultEventId?: string): ExpenseFormState {
  return {
    description: "",
    eventId: defaultEventId ?? "",
    expenseDate: new Date().toISOString().slice(0, 10),
    amount: "",
    currency: "USD",
    receiptUrl: "",
    notes: "",
  };
}

export function ExpenseFormFields({
  form,
  update,
  events,
  lockEventSelection,
  idPrefix,
}: {
  form: ExpenseFormState;
  update: <K extends keyof ExpenseFormState>(
    key: K,
    value: ExpenseFormState[K],
  ) => void;
  events: EventOption[];
  lockEventSelection?: boolean;
  idPrefix: string;
}) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-description`}>Description</FieldLabel>
        <Textarea
          id={`${idPrefix}-description`}
          required
          value={form.description}
          onChange={(event) => update("description", event.target.value)}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-event`}>Event</FieldLabel>
        <Select
          value={form.eventId || "none"}
          onValueChange={(value) =>
            update("eventId", value === "none" ? "" : (value ?? ""))
          }
          disabled={lockEventSelection}
        >
          <SelectTrigger id={`${idPrefix}-event`} className="w-full">
            <SelectValue placeholder="No event">
              {(value: string) =>
                value && value !== "none"
                  ? (events.find((event) => event.id === value)?.name ??
                    "No event")
                  : "No event"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No event</SelectItem>
            {events.map((event) => (
              <SelectItem key={event.id} value={event.id}>
                {event.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field orientation="responsive">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-expenseDate`}>Date</FieldLabel>
          <Input
            id={`${idPrefix}-expenseDate`}
            type="date"
            required
            value={form.expenseDate}
            onChange={(event) => update("expenseDate", event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-amount`}>Amount</FieldLabel>
          <Input
            id={`${idPrefix}-amount`}
            type="number"
            min="0"
            step="0.01"
            required
            value={form.amount}
            onChange={(event) => update("amount", event.target.value)}
          />
        </Field>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-currency`}>Currency</FieldLabel>
        <Select
          value={form.currency}
          onValueChange={(value) => update("currency", value ?? "USD")}
        >
          <SelectTrigger id={`${idPrefix}-currency`} className="w-full">
            <SelectValue placeholder="Select currency" />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-receiptUrl`}>Receipt link</FieldLabel>
        <Input
          id={`${idPrefix}-receiptUrl`}
          type="url"
          placeholder="https://..."
          value={form.receiptUrl}
          onChange={(event) => update("receiptUrl", event.target.value)}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-notes`}>Notes</FieldLabel>
        <Textarea
          id={`${idPrefix}-notes`}
          value={form.notes}
          onChange={(event) => update("notes", event.target.value)}
        />
      </Field>
    </>
  );
}

export function packExpenseFormData(
  form: ExpenseFormState,
  paidByPersonId: string | null,
) {
  const formData = new FormData();
  formData.set("description", form.description);
  formData.set("eventId", form.eventId);
  formData.set("expenseDate", form.expenseDate);
  formData.set("amount", form.amount);
  formData.set("currency", form.currency);
  formData.set("receiptUrl", form.receiptUrl);
  formData.set("notes", form.notes);
  formData.set("paidByPersonId", paidByPersonId ?? "");
  return formData;
}
