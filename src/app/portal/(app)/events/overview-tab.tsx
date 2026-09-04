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
import {
  formatDateTimeInZone,
  TIMEZONE_OPTIONS,
  utcIsoToDatetimeLocalInZone,
} from "@/lib/time";
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
import { runAction } from "@/components/portal/action-toast";

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

const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

function toDatetimeLocalValue(iso: string | null, timezone: string) {
  if (!iso) return "";
  return utcIsoToDatetimeLocalInZone(iso, timezone);
}

function formStateFor(event: EventRow) {
  return {
    name: event.name,
    description: event.description ?? "",
    eventType: event.event_type ?? "",
    location: event.location ?? "",
    venue: event.venue ?? "",
    startsAt: toDatetimeLocalValue(event.starts_at, event.timezone),
    endsAt: toDatetimeLocalValue(event.ends_at, event.timezone),
    timezone: event.timezone,
    visibility: event.visibility,
    status: event.status,
    programId: event.program_id ?? "",
    flierUrl: event.flier_url ?? "",
  };
}

type FormState = ReturnType<typeof formStateFor>;

function isDirty(form: FormState, event: EventRow) {
  const baseline = formStateFor(event);
  return (Object.keys(baseline) as (keyof FormState)[]).some(
    (key) => form[key] !== baseline[key],
  );
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
    formData.set("flierUrl", form.flierUrl);

    startTransition(async () => {
      await runAction(() => updateEventAction(event.id, formData), {
        success: "Event details saved.",
        onError: setError,
        onSuccess: () => {
          router.refresh();
          onSaved();
        },
      });
    });
  }

  const programName = programs.find(
    (program) => program.id === form.programId,
  )?.name;
  const locked = event.report_status === "submitted";

  if (mode === "view" || locked) {
    return (
      <FieldGroup>
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

        <ReadOnlyField label="Program" htmlFor="details-programId">
          {programName ?? "—"}
        </ReadOnlyField>

        <ReadOnlyField label="Location" htmlFor="details-location">
          {form.location || "—"}
        </ReadOnlyField>

        <Field orientation="responsive">
          <ReadOnlyField label="Starts" htmlFor="details-startsAt">
            {formatDateTimeInZone(
              event.starts_at,
              event.timezone,
              DATE_FORMAT_OPTIONS,
              "en-US",
            )}
          </ReadOnlyField>
          <ReadOnlyField label="Ends" htmlFor="details-endsAt">
            {event.ends_at
              ? formatDateTimeInZone(
                  event.ends_at,
                  event.timezone,
                  DATE_FORMAT_OPTIONS,
                  "en-US",
                )
              : "—"}
          </ReadOnlyField>
        </Field>

        <ReadOnlyField label="Timezone" htmlFor="details-timezone">
          {form.timezone}
        </ReadOnlyField>

        <ReadOnlyField label="Event name" htmlFor="details-name">
          {form.name}
        </ReadOnlyField>

        <ReadOnlyField label="Description" htmlFor="details-description">
          {form.description || "—"}
        </ReadOnlyField>

        <ReadOnlyField label="Flier image URL" htmlFor="details-flierUrl">
          {form.flierUrl || "—"}
        </ReadOnlyField>
      </FieldGroup>
    );
  }

  return (
    <form id={formId} onSubmit={handleSubmit}>
      <FieldGroup>
        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="details-visibility">Visibility</FieldLabel>
            <Select
              value={form.visibility}
              onValueChange={(value) =>
                update("visibility", value ?? "private")
              }
            >
              <SelectTrigger id="details-visibility" className="w-full">
                <SelectValue placeholder="Select visibility">
                  {(value: string) =>
                    VISIBILITIES.find((option) => option.value === value)
                      ?.label ?? "Select visibility"
                  }
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
            <Select
              value={form.status}
              onValueChange={(value) => update("status", value ?? "draft")}
            >
              <SelectTrigger id="details-status" className="w-full">
                <SelectValue placeholder="Select status">
                  {(value: string) =>
                    STATUSES.find((option) => option.value === value)?.label ??
                    "Select status"
                  }
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

        <Field>
          <FieldLabel htmlFor="details-programId">Program</FieldLabel>
          <Select
            value={form.programId || "none"}
            onValueChange={(value) =>
              update("programId", value === "none" ? "" : (value ?? ""))
            }
          >
            <SelectTrigger id="details-programId" className="w-full">
              <SelectValue placeholder="No program">
                {(value: string) =>
                  value && value !== "none"
                    ? (programs.find((program) => program.id === value)?.name ??
                      "No program")
                    : "No program"
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

        <Field>
          <FieldLabel htmlFor="details-location">Location</FieldLabel>
          <Input
            id="details-location"
            value={form.location}
            onChange={(changeEvent) =>
              update("location", changeEvent.target.value)
            }
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
              onChange={(changeEvent) =>
                update("startsAt", changeEvent.target.value)
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="details-endsAt">Ends</FieldLabel>
            <Input
              id="details-endsAt"
              type="datetime-local"
              value={form.endsAt}
              onChange={(changeEvent) =>
                update("endsAt", changeEvent.target.value)
              }
            />
          </Field>
        </Field>

        <Field>
          <FieldLabel htmlFor="details-timezone">Timezone</FieldLabel>
          <Select
            value={form.timezone}
            onValueChange={(value) => update("timezone", value ?? "")}
          >
            <SelectTrigger id="details-timezone" className="w-full">
              <SelectValue placeholder="Select timezone">
                {(value: string) =>
                  TIMEZONE_OPTIONS.find((option) => option.value === value)
                    ?.label ?? value
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {TIMEZONE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
              {form.timezone &&
                !TIMEZONE_OPTIONS.some(
                  (option) => option.value === form.timezone,
                ) && (
                  <SelectItem value={form.timezone}>{form.timezone}</SelectItem>
                )}
            </SelectContent>
          </Select>
        </Field>

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
            onChange={(changeEvent) =>
              update("description", changeEvent.target.value)
            }
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="details-flierUrl">Flier image URL</FieldLabel>
          <Input
            id="details-flierUrl"
            type="url"
            placeholder="https://drive.google.com/file/d/..."
            value={form.flierUrl}
            onChange={(changeEvent) =>
              update("flierUrl", changeEvent.target.value)
            }
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
