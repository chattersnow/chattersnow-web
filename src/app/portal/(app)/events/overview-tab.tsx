"use client";

import { FormEvent, Ref, useEffect, useImperativeHandle, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateEventAction } from "./actions";
import type { Program } from "../programs/actions";
import type { EventRow } from "./event-badges";
import { StatusBadge, VisibilityBadge } from "./event-badges";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "archived", label: "Archived" },
];

const viewDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDatetimeLocal(value: string) {
  if (!value) return "—";
  return viewDateFormatter.format(new Date(value));
}

function toDatetimeLocalValue(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formStateFor(event: EventRow) {
  return {
    name: event.name,
    description: event.description ?? "",
    eventType: event.event_type ?? "",
    location: event.location ?? "",
    venue: event.venue ?? "",
    startsAt: toDatetimeLocalValue(event.starts_at),
    endsAt: toDatetimeLocalValue(event.ends_at),
    timezone: event.timezone,
    visibility: event.visibility,
    status: event.status,
    programId: event.program_id ?? "",
  };
}

type FormState = ReturnType<typeof formStateFor>;

function isDirty(form: FormState, event: EventRow) {
  const baseline = formStateFor(event);
  return (Object.keys(baseline) as (keyof FormState)[]).some((key) => form[key] !== baseline[key]);
}

export type OverviewTabHandle = {
  discard: () => void;
};

export function OverviewTab({
  event,
  programs,
  formId,
  mode,
  onSaved,
  onPendingChange,
  onDirtyChange,
  ref,
}: {
  event: EventRow;
  programs: Program[];
  formId: string;
  mode: "view" | "edit";
  onSaved: () => void;
  onPendingChange?: (pending: boolean) => void;
  onDirtyChange?: (dirty: boolean) => void;
  ref?: Ref<OverviewTabHandle>;
}) {
  const router = useRouter();
  const [form, setForm] = useState(() => formStateFor(event));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
    formData.set("name", form.name);
    formData.set("description", form.description);
    formData.set("eventType", form.eventType);
    formData.set("location", form.location);
    formData.set("venue", form.venue);
    formData.set("startsAt", form.startsAt);
    formData.set("endsAt", form.endsAt);
    formData.set("timezone", form.timezone);
    formData.set("visibility", form.visibility);
    formData.set("status", form.status);
    formData.set("programId", form.programId);

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

  const programName = programs.find((program) => program.id === form.programId)?.name;

  if (mode === "view") {
    return (
      <FieldGroup>
        <ReadOnlyField label="Event name" htmlFor="details-name">
          {form.name}
        </ReadOnlyField>

        <ReadOnlyField label="Description" htmlFor="details-description">
          {form.description || "—"}
        </ReadOnlyField>

        <ReadOnlyField label="Program" htmlFor="details-programId">
          {programName ?? "—"}
        </ReadOnlyField>

        <Field orientation="responsive">
          <ReadOnlyField label="Event type" htmlFor="details-eventType">
            {form.eventType || "—"}
          </ReadOnlyField>
          <ReadOnlyField label="Venue / mountain" htmlFor="details-venue">
            {form.venue || "—"}
          </ReadOnlyField>
        </Field>

        <ReadOnlyField label="Location" htmlFor="details-location">
          {form.location || "—"}
        </ReadOnlyField>

        <Field orientation="responsive">
          <ReadOnlyField label="Starts" htmlFor="details-startsAt">
            {formatDatetimeLocal(form.startsAt)}
          </ReadOnlyField>
          <ReadOnlyField label="Ends" htmlFor="details-endsAt">
            {formatDatetimeLocal(form.endsAt)}
          </ReadOnlyField>
        </Field>

        <ReadOnlyField label="Timezone" htmlFor="details-timezone">
          {form.timezone}
        </ReadOnlyField>

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="details-visibility">Visibility</FieldLabel>
            <div id="details-visibility">
              <VisibilityBadge visibility={form.visibility} />
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor="details-status">Status</FieldLabel>
            <div id="details-status">
              <StatusBadge status={form.status} />
            </div>
          </Field>
        </Field>
      </FieldGroup>
    );
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
          <FieldLabel htmlFor="details-description">Description</FieldLabel>
          <Textarea
            id="details-description"
            value={form.description}
            onChange={(changeEvent) => update("description", changeEvent.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="details-programId">Program</FieldLabel>
          <Select
            value={form.programId || "none"}
            onValueChange={(value) => update("programId", value === "none" ? "" : (value ?? ""))}
          >
            <SelectTrigger id="details-programId" className="w-full">
              <SelectValue placeholder="No program">
                {(value: string) =>
                  value && value !== "none" ? (programs.find((program) => program.id === value)?.name ?? "No program") : "No program"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No program</SelectItem>
              {programs.map((program) => (
                <SelectItem key={program.id} value={program.id}>
                  {program.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="details-eventType">Event type</FieldLabel>
            <Input
              id="details-eventType"
              placeholder="e.g. Access Day, Gear Exchange, Community Ride"
              value={form.eventType}
              onChange={(changeEvent) => update("eventType", changeEvent.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="details-venue">Venue / mountain</FieldLabel>
            <Input
              id="details-venue"
              value={form.venue}
              onChange={(changeEvent) => update("venue", changeEvent.target.value)}
            />
          </Field>
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
