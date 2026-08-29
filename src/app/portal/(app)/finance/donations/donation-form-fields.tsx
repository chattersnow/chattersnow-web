"use client";

import {
  PAYMENT_METHODS,
  paymentMethodLabel,
  type EventOption,
} from "./donations-shared";
import { PersonPicker, type PickedPerson } from "../../people/person-picker";
import type { PersonListItem } from "../../people/actions";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type DonationFormState = {
  donor: PickedPerson | null;
  eventId: string;
  method: string;
  receivedDate: string;
  amount: string;
  notes: string;
};

export function emptyDonationForm(): DonationFormState {
  return {
    donor: null,
    eventId: "",
    method: "",
    receivedDate: new Date().toISOString().slice(0, 10),
    amount: "",
    notes: "",
  };
}

export function DonationFormFields({
  form,
  update,
  events,
  people,
  onPersonCreated,
  idPrefix,
}: {
  form: DonationFormState;
  update: <K extends keyof DonationFormState>(
    key: K,
    value: DonationFormState[K],
  ) => void;
  events: EventOption[];
  people: PersonListItem[];
  onPersonCreated: (person: PickedPerson) => void;
  idPrefix: string;
}) {
  return (
    <>
      <Field>
        <FieldLabel>Donor</FieldLabel>
        <PersonPicker
          people={people}
          selected={form.donor}
          onSelect={(person) => update("donor", person)}
          onPersonCreated={onPersonCreated}
          newPersonRole="is_donor"
          placeholder="Search donors by name or email..."
        />
        <FieldDescription>
          Leave empty for an anonymous donation.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-method`}>Payment method</FieldLabel>
        <Select
          value={form.method}
          onValueChange={(value) => update("method", value ?? "")}
        >
          <SelectTrigger id={`${idPrefix}-method`} className="w-full">
            <SelectValue placeholder="Select payment method" />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_METHODS.map((method) => (
              <SelectItem key={method} value={method}>
                {paymentMethodLabel(method)}
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

export function packDonationFormData(form: DonationFormState) {
  const formData = new FormData();
  formData.set("donorId", form.donor?.id ?? "");
  formData.set("eventId", form.eventId);
  formData.set("method", form.method);
  formData.set("receivedDate", form.receivedDate);
  formData.set("amount", form.amount);
  formData.set("notes", form.notes);
  return formData;
}
