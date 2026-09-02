"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  type EventVolunteer,
  type EventVolunteerHours,
} from "../volunteers-actions";
import { type EventShift } from "../shifts-actions";
import { PersonPicker, type PickedPerson } from "../../people/person-picker";
import { type PersonListItem } from "../../people/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

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

export function AddHoursForm({
  volunteers,
  shifts,
  onSubmit,
  onCancel,
}: {
  volunteers: EventVolunteer[];
  shifts: EventShift[];
  onSubmit: (
    personId: string,
    formData: FormData,
  ) => Promise<{ error: string } | { success: true }>;
  onCancel: () => void;
}) {
  const router = useRouter();
  const people: PersonListItem[] = volunteers.map((volunteer) => ({
    ...volunteer.person,
    is_sponsor: false,
  }));
  const [selectedPerson, setSelectedPerson] = useState<PickedPerson | null>(
    null,
  );
  const [hours, setHours] = useState("");
  const [loggedDate, setLoggedDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSelectPerson(person: PickedPerson | null) {
    setSelectedPerson(person);
    const volunteer = person
      ? volunteers.find((v) => v.person_id === person.id)
      : undefined;
    const shift = volunteer?.shift_id
      ? shifts.find((s) => s.id === volunteer.shift_id)
      : undefined;
    if (!shift) return;
    const defaults = shiftHoursAndDate(shift);
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

    startTransition(async () => {
      const result = await onSubmit(selectedPerson.id, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
      onCancel();
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
          <PersonPicker
            people={people}
            selected={selectedPerson}
            onSelect={handleSelectPerson}
            onPersonCreated={() => {}}
            allowCreate={false}
            placeholder="Search signed-up volunteers..."
          />
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

export function HoursSection({
  hours,
  mode,
  isDeleting,
  loading,
  totalHours,
  onDeleteHours,
}: {
  hours: EventVolunteerHours[];
  mode: "view" | "edit";
  isDeleting: boolean;
  loading: boolean;
  totalHours: number;
  onDeleteHours: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-[var(--line)] pt-4">
      <h3 className="text-sm font-semibold">
        Hours logged
        {hours && hours.length > 0 ? ` (${totalHours} total)` : ""}
      </h3>
      {loading ? (
        <TabLoadingSkeleton />
      ) : hours.length === 0 ? (
        <p className="app-muted text-sm">No hours logged yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Volunteer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Hours</TableHead>
              <TableHead className="w-px" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {hours.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell
                  className="max-w-xs truncate font-medium"
                  title={entry.person?.name ?? undefined}
                >
                  {entry.person?.name ?? "—"}
                </TableCell>
                <TableCell className="app-muted">
                  {dateFormatter.format(new Date(entry.logged_date))}
                </TableCell>
                <TableCell>{entry.hours}</TableCell>
                <TableCell className="text-right">
                  {mode === "edit" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove hours entry"
                      disabled={isDeleting}
                      onClick={() => onDeleteHours(entry.id)}
                    >
                      {isDeleting ? <Spinner /> : <Trash2 />}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
