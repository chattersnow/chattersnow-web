"use client";

import { FormEvent, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { FieldRow } from "@/components/field-row";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { todayInBrowser, utcIsoToDateInZone } from "@/lib/time";
import {
  MAX_SELF_LOGGED_HOURS,
  type LoggableEvent,
  type VolunteerRoleOption,
} from "@/lib/constituent/hours";
import { logMyVolunteerHoursAction } from "./actions";

/** The "nothing chosen" option. A Select cannot hold an empty string as a value. */
const NO_EVENT = "none";
const NO_EVENT_LABEL = "Not a particular event";
const NO_ROLE_LABEL = "Not sure";

export function LogHoursForm({
  events,
  roles,
}: {
  events: LoggableEvent[];
  roles: VolunteerRoleOption[];
}) {
  const [eventId, setEventId] = useState(NO_EVENT);
  const [roleTypeId, setRoleTypeId] = useState(NO_EVENT);
  const [loggedDate, setLoggedDate] = useState(() => todayInBrowser());
  const [hours, setHours] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  /**
   * Picking an event moves the date to that event's day, in the event's own
   * zone -- not to today. A date field on a form scoped to an event is about
   * the event, and somebody logging Saturday's shift on Monday evening should
   * not have to correct the field the form just filled in for them. They still
   * can: setup the day before is real, and the field stays editable.
   */
  function handleEventChange(next: string | null) {
    const chosen = next ?? NO_EVENT;
    setEventId(chosen);
    setSubmitted(false);
    const picked = events.find((event) => event.event_id === chosen);
    if (picked) {
      setLoggedDate(utcIsoToDateInZone(picked.starts_at, picked.timezone));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSaving(true);

    const payload = new FormData();
    payload.set("hours", hours);
    payload.set("loggedDate", loggedDate);
    payload.set("notes", notes);
    if (eventId !== NO_EVENT) payload.set("eventId", eventId);
    if (roleTypeId !== NO_EVENT) payload.set("roleTypeId", roleTypeId);

    const result = await logMyVolunteerHoursAction(payload);
    setIsSaving(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }

    setSubmitted(true);
    setHours("");
    setNotes("");
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <FieldGroup>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {submitted ? (
          <Alert>
            <AlertDescription>
              Thank you — that is logged. Someone will confirm it, and it will
              appear in your volunteering once they have.
            </AlertDescription>
          </Alert>
        ) : null}

        {events.length > 0 ? (
          <Field>
            <FieldLabel htmlFor="my-hours-event">What was it for?</FieldLabel>
            <Select value={eventId} onValueChange={handleEventChange}>
              <SelectTrigger id="my-hours-event" className="w-full">
                {/* A render child, not a bare SelectValue: this Select shows
                    the raw value otherwise, so the trigger would read
                    "none". */}
                <SelectValue>
                  {(value: string) =>
                    events.find((option) => option.event_id === value)?.name ??
                    NO_EVENT_LABEL
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_EVENT}>{NO_EVENT_LABEL}</SelectItem>
                {events.map((event) => (
                  <SelectItem key={event.event_id} value={event.event_id}>
                    {event.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}

        {/* The area's one other two-column row, converted with the rest of
            the constituent pages: `responsive` centred the pair against each
            other, so the description under "How many hours?" lifted the date
            picker beside it off the label line. See
            `src/components/field-row.tsx`. */}
        <FieldRow>
          <Field>
            <FieldLabel htmlFor="my-hours-date">Which day?</FieldLabel>
            <Input
              id="my-hours-date"
              type="date"
              value={loggedDate}
              max={todayInBrowser()}
              onChange={(event) => {
                setLoggedDate(event.target.value);
                setSubmitted(false);
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="my-hours-hours">How many hours?</FieldLabel>
            <Input
              id="my-hours-hours"
              type="number"
              inputMode="decimal"
              min="0.25"
              max={MAX_SELF_LOGGED_HOURS}
              step="0.25"
              value={hours}
              onChange={(event) => {
                setHours(event.target.value);
                setSubmitted(false);
              }}
            />
            <FieldDescription>
              To the nearest quarter hour. One day at a time.
            </FieldDescription>
          </Field>
        </FieldRow>

        {roles.length > 0 ? (
          <Field>
            <FieldLabel htmlFor="my-hours-role">
              What were you doing? (optional)
            </FieldLabel>
            <Select
              value={roleTypeId}
              onValueChange={(next) => {
                setRoleTypeId(next ?? NO_EVENT);
                setSubmitted(false);
              }}
            >
              <SelectTrigger id="my-hours-role" className="w-full">
                <SelectValue>
                  {(value: string) =>
                    roles.find((option) => option.id === value)?.name ??
                    NO_ROLE_LABEL
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_EVENT}>{NO_ROLE_LABEL}</SelectItem>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}

        <Field>
          <FieldLabel htmlFor="my-hours-notes">
            Anything we should know? (optional)
          </FieldLabel>
          <Textarea
            id="my-hours-notes"
            rows={3}
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
              setSubmitted(false);
            }}
          />
        </Field>

        <Field orientation="horizontal">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? <Spinner className="size-4" /> : null}
            Log these hours
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
