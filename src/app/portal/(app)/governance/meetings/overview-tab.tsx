"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { updateMeetingAction } from "./actions";
import { MeetingStatusBadge, MeetingTypeBadge, type MeetingRow } from "./meeting-badges";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const MEETING_TYPES = [
  { value: "board", label: "Board" },
  { value: "committee", label: "Committee" },
  { value: "annual", label: "Annual" },
  { value: "other", label: "Other" },
];

const STATUSES = [
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const viewDateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

function formatDatetimeLocal(value: string) {
  if (!value) return "—";
  return viewDateFormatter.format(new Date(value));
}

function toDatetimeLocalValue(iso: string) {
  const date = new Date(iso);
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formStateFor(meeting: MeetingRow) {
  return {
    meetingDate: toDatetimeLocalValue(meeting.meeting_date),
    meetingType: meeting.meeting_type,
    status: meeting.status,
    location: meeting.location ?? "",
    notes: meeting.notes ?? "",
  };
}

type FormState = ReturnType<typeof formStateFor>;

function MeetingOverviewForm({
  meeting,
  onSaved,
  onCancel,
}: {
  meeting: MeetingRow;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => formStateFor(meeting));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("meetingDate", form.meetingDate);
    formData.set("meetingType", form.meetingType);
    formData.set("status", form.status);
    formData.set("location", form.location);
    formData.set("notes", form.notes);

    startTransition(async () => {
      const result = await updateMeetingAction(meeting.id, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
      onSaved();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-md border border-[var(--line)] p-4">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="meeting-date">Date &amp; time</FieldLabel>
          <Input
            id="meeting-date"
            type="datetime-local"
            required
            value={form.meetingDate}
            onChange={(event) => update("meetingDate", event.target.value)}
          />
        </Field>

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="meeting-type">Type</FieldLabel>
            <Select value={form.meetingType} onValueChange={(value) => update("meetingType", value ?? "board")}>
              <SelectTrigger id="meeting-type">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                {MEETING_TYPES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="meeting-status">Status</FieldLabel>
            <Select value={form.status} onValueChange={(value) => update("status", value ?? "scheduled")}>
              <SelectTrigger id="meeting-status">
                <SelectValue placeholder="Status" />
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
          <FieldLabel htmlFor="meeting-location">Location</FieldLabel>
          <Input
            id="meeting-location"
            value={form.location}
            onChange={(event) => update("location", event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="meeting-notes">Notes</FieldLabel>
          <Textarea
            id="meeting-notes"
            value={form.notes}
            onChange={(event) => update("notes", event.target.value)}
          />
        </Field>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Save meeting"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function OverviewTab({ meeting, mode }: { meeting: MeetingRow; mode: "view" | "edit" }) {
  const [editing, setEditing] = useState(false);
  const [prevMode, setPrevMode] = useState(mode);

  if (mode !== prevMode) {
    setPrevMode(mode);
    if (mode === "view") setEditing(false);
  }

  if (editing) {
    return <MeetingOverviewForm meeting={meeting} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <FieldGroup>
        <ReadOnlyField label="Date & time" htmlFor="meeting-date-view">
          {formatDatetimeLocal(meeting.meeting_date)}
        </ReadOnlyField>
        <ReadOnlyField label="Type" htmlFor="meeting-type-view">
          <MeetingTypeBadge type={meeting.meeting_type} />
        </ReadOnlyField>
        <ReadOnlyField label="Status" htmlFor="meeting-status-view">
          <MeetingStatusBadge status={meeting.status} />
        </ReadOnlyField>
        <ReadOnlyField label="Location" htmlFor="meeting-location-view">
          {meeting.location || "—"}
        </ReadOnlyField>
        <ReadOnlyField label="Notes" htmlFor="meeting-notes-view">
          {meeting.notes || "—"}
        </ReadOnlyField>
      </FieldGroup>
      {mode === "edit" && (
        <div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Edit meeting" onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
        </div>
      )}
    </div>
  );
}
