"use client";

import {
  REVENUE_SOURCES,
  revenueSourceLabel,
  type EventOption,
} from "./revenue-shared";
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

export type RevenueFormState = {
  eventId: string;
  source: string;
  receivedDate: string;
  amount: string;
  notes: string;
};

export function emptyRevenueForm(defaultEventId?: string): RevenueFormState {
  return {
    eventId: defaultEventId ?? "",
    source: "",
    receivedDate: new Date().toISOString().slice(0, 10),
    amount: "",
    notes: "",
  };
}

export function RevenueFormFields({
  form,
  update,
  events,
  lockEventSelection,
  idPrefix,
}: {
  form: RevenueFormState;
  update: <K extends keyof RevenueFormState>(
    key: K,
    value: RevenueFormState[K],
  ) => void;
  events: EventOption[];
  lockEventSelection?: boolean;
  idPrefix: string;
}) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-source`}>Source</FieldLabel>
        <Select
          value={form.source}
          onValueChange={(value) => update("source", value ?? "")}
        >
          <SelectTrigger id={`${idPrefix}-source`} className="w-full">
            <SelectValue placeholder="Select source" />
          </SelectTrigger>
          <SelectContent>
            {REVENUE_SOURCES.map((source) => (
              <SelectItem key={source} value={source}>
                {revenueSourceLabel(source)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
          <FieldLabel htmlFor={`${idPrefix}-receivedDate`}>Date</FieldLabel>
          <Input
            id={`${idPrefix}-receivedDate`}
            type="date"
            required
            value={form.receivedDate}
            onChange={(event) => update("receivedDate", event.target.value)}
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

export function packRevenueFormData(form: RevenueFormState) {
  const formData = new FormData();
  formData.set("eventId", form.eventId);
  formData.set("source", form.source);
  formData.set("receivedDate", form.receivedDate);
  formData.set("amount", form.amount);
  formData.set("notes", form.notes);
  return formData;
}
