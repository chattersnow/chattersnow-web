"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateEventAction } from "./actions";
import type { EventRow } from "./event-badges";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const VISIBILITIES = [
  { value: "private", label: "Private" },
  { value: "public", label: "Public" },
];

const STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
];

function toDatetimeLocalValue(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formStateFor(event: EventRow) {
  return {
    name: event.name,
    location: event.location ?? "",
    startsAt: toDatetimeLocalValue(event.starts_at),
    endsAt: toDatetimeLocalValue(event.ends_at),
    timezone: event.timezone,
    visibility: event.visibility,
    status: event.status,
  };
}

export function OverviewTab({
  event,
  formId,
  onSaved,
  onPendingChange,
}: {
  event: EventRow;
  formId: string;
  onSaved: () => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState(() => formStateFor(event));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    onPendingChange?.(isPending);
  }, [isPending, onPendingChange]);

  function update<K extends keyof ReturnType<typeof formStateFor>>(
    key: K,
    value: ReturnType<typeof formStateFor>[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("name", form.name);
    formData.set("location", form.location);
    formData.set("startsAt", form.startsAt);
    formData.set("endsAt", form.endsAt);
    formData.set("timezone", form.timezone);
    formData.set("visibility", form.visibility);
    formData.set("status", form.status);

    startTransition(async () => {
      const result = await updateEventAction(event.id, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
      onSaved();
    });
  }

  return (
    <form id={formId} onSubmit={handleSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="details-name">Event name</FieldLabel>
          <Input
            id="details-name"
            required
            value={form.name}
            onChange={(changeEvent) => update("name", changeEvent.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="details-location">Location</FieldLabel>
          <Input
            id="details-location"
            value={form.location}
            onChange={(changeEvent) => update("location", changeEvent.target.value)}
          />
        </Field>

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="details-startsAt">Starts</FieldLabel>
            <Input
              id="details-startsAt"
              required
              type="datetime-local"
              value={form.startsAt}
              onChange={(changeEvent) => update("startsAt", changeEvent.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="details-endsAt">Ends</FieldLabel>
            <Input
              id="details-endsAt"
              type="datetime-local"
              value={form.endsAt}
              onChange={(changeEvent) => update("endsAt", changeEvent.target.value)}
            />
          </Field>
        </Field>

        <Field>
          <FieldLabel htmlFor="details-timezone">Timezone</FieldLabel>
          <Input
            id="details-timezone"
            required
            placeholder="e.g. America/Chicago"
            value={form.timezone}
            onChange={(changeEvent) => update("timezone", changeEvent.target.value)}
          />
        </Field>

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="details-visibility">Visibility</FieldLabel>
            <Select
              value={form.visibility}
              onValueChange={(value) => update("visibility", value ?? "private")}
            >
              <SelectTrigger id="details-visibility" className="w-full">
                <SelectValue placeholder="Select visibility">
                  {(value: string) => VISIBILITIES.find((option) => option.value === value)?.label ?? "Select visibility"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {VISIBILITIES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="details-status">Status</FieldLabel>
            <Select value={form.status} onValueChange={(value) => update("status", value ?? "draft")}>
              <SelectTrigger id="details-status" className="w-full">
                <SelectValue placeholder="Select status">
                  {(value: string) => STATUSES.find((option) => option.value === value)?.label ?? "Select status"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
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
