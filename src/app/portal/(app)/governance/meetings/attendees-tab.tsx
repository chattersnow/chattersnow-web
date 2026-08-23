"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  createMeetingAttendeeAction,
  deleteMeetingAttendeeAction,
  listMeetingAttendeesAction,
  type MeetingAttendee,
} from "./attendees-actions";
import { SponsorPersonPicker, type PickedPerson } from "../../events/sponsor-person-picker";
import { listPeopleAction, type PersonListItem } from "../../people/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function AddAttendeeForm({
  people,
  onPersonCreated,
  onSubmit,
  onCancel,
}: {
  people: PersonListItem[];
  onPersonCreated: (person: PickedPerson) => void;
  onSubmit: (personId: string, attended: boolean) => Promise<{ error: string } | { success: true }>;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [selectedPerson, setSelectedPerson] = useState<PickedPerson | null>(null);
  const [attended, setAttended] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!selectedPerson) {
      setError("Select or create a person to add.");
      return;
    }

    startTransition(async () => {
      const result = await onSubmit(selectedPerson.id, attended);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
      onCancel();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-md border border-[var(--line)] p-4">
      <FieldGroup>
        <Field>
          <FieldLabel>Person</FieldLabel>
          <SponsorPersonPicker
            people={people}
            selected={selectedPerson}
            onSelect={setSelectedPerson}
            onPersonCreated={onPersonCreated}
          />
        </Field>

        <Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={attended} onCheckedChange={(checked) => setAttended(checked === true)} />
            Attended
          </label>
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
            {isPending ? "Saving..." : "Add attendee"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function AttendeesTab({ meetingId, active, mode }: { meetingId: string; active: boolean; mode: "view" | "edit" }) {
  const router = useRouter();
  const [attendees, setAttendees] = useState<MeetingAttendee[] | null>(null);
  const [people, setPeople] = useState<PersonListItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [prevMode, setPrevMode] = useState(mode);

  if (mode !== prevMode) {
    setPrevMode(mode);
    if (mode === "view") setShowAdd(false);
  }

  function load() {
    listMeetingAttendeesAction(meetingId).then((result) => {
      if ("error" in result) setLoadError(result.error);
      else setAttendees(result.data);
    });
    listPeopleAction().then((result) => {
      if (!("error" in result)) setPeople(result.data);
    });
  }

  useEffect(() => {
    if (!active) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, meetingId]);

  function refresh() {
    load();
    router.refresh();
  }

  function handlePersonCreated(person: PickedPerson) {
    setPeople((prev) => [...prev, { ...person, is_sponsor: false }]);
  }

  function handleDelete(id: string) {
    startDeleteTransition(async () => {
      await deleteMeetingAttendeeAction(id);
      refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {attendees === null ? (
        <p className="app-muted text-sm">Loading attendees...</p>
      ) : attendees.length === 0 && !showAdd ? (
        <p className="app-muted text-sm">No attendees recorded yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Attended</TableHead>
              <TableHead className="w-px" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {attendees?.map((attendee) => (
              <TableRow key={attendee.id}>
                <TableCell className="font-medium">{attendee.person?.name ?? "—"}</TableCell>
                <TableCell className="app-muted">{attendee.attended ? "Yes" : "No"}</TableCell>
                <TableCell className="text-right">
                  {mode === "edit" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove attendee"
                      disabled={isDeleting}
                      onClick={() => handleDelete(attendee.id)}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {mode === "edit" &&
        (showAdd ? (
          <AddAttendeeForm
            people={people}
            onPersonCreated={handlePersonCreated}
            onSubmit={(personId, attended) => createMeetingAttendeeAction(meetingId, personId, attended)}
            onCancel={() => setShowAdd(false)}
          />
        ) : (
          <div>
            <Button type="button" variant="outline" onClick={() => setShowAdd(true)}>
              + Add attendee
            </Button>
          </div>
        ))}
    </div>
  );
}
