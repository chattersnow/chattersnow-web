"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  type EventVolunteer,
  type EventVolunteerPerson,
} from "../volunteers-actions";
import { type EventShift } from "../shifts-actions";
import { PersonPicker, type PickedPerson } from "../../people/person-picker";
import { type PersonListItem } from "../../people/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { personDisplayName } from "@/lib/format";
import { runAction } from "@/components/portal/action-toast";

function shiftHoursAndDate(shift: EventShift) {
  const durationHours =
    (new Date(shift.ends_at).getTime() - new Date(shift.starts_at).getTime()) /
    3_600_000;
  const roundedHours = Math.round(durationHours * 4) / 4;
  return {
    hours: String(roundedHours),
    loggedDate: shift.starts_at.slice(0, 10),
  };
}

/**
 * The hours and date a volunteer's own shift implies, so the common case --
 * "they worked the shift they signed up for" -- is one confirm rather than
 * two lookups. Falls back to a blank entry dated today.
 */
function defaultsForPerson(
  person: PickedPerson | null,
  volunteers: EventVolunteer[],
  shifts: EventShift[],
) {
  const volunteer = person
    ? volunteers.find((v) => v.person_id === person.id)
    : undefined;
  const shift = volunteer?.shift_id
    ? shifts.find((s) => s.id === volunteer.shift_id)
    : undefined;
  return shift
    ? shiftHoursAndDate(shift)
    : { hours: "", loggedDate: new Date().toISOString().slice(0, 10) };
}

export function AddHoursForm({
  volunteers,
  shifts,
  lockedPerson,
  onSubmit,
  onCancel,
}: {
  volunteers: EventVolunteer[];
  shifts: EventShift[];
  /**
   * Set when the form is opened from a specific roster row. The volunteer is
   * then fixed and shown read-only instead of offering a picker that could
   * only ever be re-set to the person it already names.
   */
  lockedPerson?: EventVolunteerPerson;
  onSubmit: (
    personId: string,
    formData: FormData,
  ) => Promise<{ error: string } | { success: true }>;
  onCancel: () => void;
}) {
  const router = useRouter();
  const people: PersonListItem[] = volunteers.map((volunteer) => ({
    ...volunteer.person,
  }));
  const [selectedPerson, setSelectedPerson] = useState<PickedPerson | null>(
    lockedPerson ?? null,
  );
  // Seeded lazily rather than in an effect: the compiler lint that ships with
  // eslint-config-next fails on setting state from an effect body, and the
  // dialog only mounts this form once its volunteers have loaded, so the
  // locked person's shift is already known on the first render.
  const [hours, setHours] = useState(
    () => defaultsForPerson(lockedPerson ?? null, volunteers, shifts).hours,
  );
  const [loggedDate, setLoggedDate] = useState(
    () =>
      defaultsForPerson(lockedPerson ?? null, volunteers, shifts).loggedDate,
  );
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSelectPerson(person: PickedPerson | null) {
    setSelectedPerson(person);
    const defaults = defaultsForPerson(person, volunteers, shifts);
    if (!defaults.hours) return;
    setHours(defaults.hours);
    setLoggedDate(defaults.loggedDate);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!selectedPerson) {
      setError("Select a signed-up volunteer to log hours for.");
      return;
    }

    const formData = new FormData();
    formData.set("hours", hours);
    formData.set("loggedDate", loggedDate);
    formData.set("notes", notes);

    const person = selectedPerson;
    startTransition(async () => {
      await runAction(() => onSubmit(person.id, formData), {
        success: `${hours} hours logged for ${personDisplayName(person)}.`,
        onError: setError,
        onSuccess: () => {
          router.refresh();
          onCancel();
        },
      });
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-md border border-[var(--line)] p-4"
    >
      <FieldGroup>
        <Field>
          <FieldLabel>Volunteer</FieldLabel>
          {lockedPerson ? (
            <p className="app-muted rounded-md border border-[var(--line)] px-3 py-2 text-sm">
              {personDisplayName(lockedPerson)}
            </p>
          ) : (
            <PersonPicker
              people={people}
              selected={selectedPerson}
              onSelect={handleSelectPerson}
              onPersonCreated={() => {}}
              allowCreate={false}
              placeholder="Search signed-up volunteers..."
            />
          )}
        </Field>

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="hours-hours">Hours</FieldLabel>
            <Input
              id="hours-hours"
              type="number"
              min="0"
              step="0.25"
              value={hours}
              onChange={(event) => setHours(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="hours-loggedDate">Date</FieldLabel>
            <Input
              id="hours-loggedDate"
              type="date"
              value={loggedDate}
              onChange={(event) => setLoggedDate(event.target.value)}
            />
          </Field>
        </Field>

        <Field>
          <FieldLabel htmlFor="hours-notes">Notes</FieldLabel>
          <Textarea
            id="hours-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              "Log hours"
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
