"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createMeetingAttendeeAction,
  deleteMeetingAttendeeAction,
  listMeetingAttendeesAction,
  type MeetingAttendee,
} from "./attendees-actions";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import { PersonPicker, type PickedPerson } from "../../people/person-picker";
import { listPeopleAction, type PersonListItem } from "../../people/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useResetOnModeChange, useTabData } from "@/hooks/use-tab-data";
import { Spinner } from "@/components/ui/spinner";
import { personDisplayName } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";
import { runAction } from "@/components/portal/action-toast";

function AddAttendeeForm({
  people,
  onPersonCreated,
  onSubmit,
  onCancel,
}: {
  people: PersonListItem[];
  onPersonCreated: (person: PickedPerson) => void;
  onSubmit: (
    personId: string,
    attended: boolean,
  ) => Promise<{ error: string } | { success: true }>;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [selectedPerson, setSelectedPerson] = useState<PickedPerson | null>(
    null,
  );
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

    const person = selectedPerson;
    startTransition(async () => {
      await runAction(() => onSubmit(person.id, attended), {
        success: `${personDisplayName(person)} added to the attendee list.`,
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
          <FieldLabel>Person</FieldLabel>
          <PersonPicker
            people={people}
            selected={selectedPerson}
            onSelect={setSelectedPerson}
            onPersonCreated={onPersonCreated}
          />
        </Field>

        <Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={attended}
              onCheckedChange={(checked) => setAttended(checked === true)}
            />
            Attended
          </label>
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
              "Add attendee"
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function AttendeesTab({
  meetingId,
  mode,
}: {
  meetingId: string;
  mode: "view" | "edit";
}) {
  const router = useRouter();
  const {
    data: attendees,
    loadError,
    refresh: refreshAttendees,
  } = useTabData<MeetingAttendee[]>(
    () => listMeetingAttendeesAction(meetingId),
    [meetingId],
  );
  const [people, setPeople] = useState<PersonListItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();

  useResetOnModeChange(mode, () => setShowAdd(false));

  useEffect(() => {
    listPeopleAction().then((result) => {
      if (!("error" in result)) setPeople(result.data);
    });
  }, [meetingId]);

  function refresh() {
    refreshAttendees();
    router.refresh();
  }

  function handlePersonCreated(person: PickedPerson) {
    setPeople((prev) => [...prev, person]);
  }

  function handleDelete(id: string) {
    startDeleteTransition(async () => {
      await runAction(() => deleteMeetingAttendeeAction(id), {
        success: "Attendee removed.",
        error: "Could not remove the attendee. Please try again.",
        onSuccess: refresh,
      });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {attendees === undefined ? (
        <TabLoadingSkeleton />
      ) : attendees.length === 0 && !showAdd ? (
        <EmptyState
          title="No attendees recorded yet"
          description={
            mode === "edit"
              ? "Record who was at this meeting with Add attendee below."
              : "Attendees appear here once a governance manager records them for this meeting."
          }
        />
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
                <TableCell
                  className="max-w-xs truncate font-medium"
                  title={attendee.person?.name ?? undefined}
                >
                  {personDisplayName(attendee.person)}
                </TableCell>
                <TableCell className="app-muted">
                  {attendee.attended ? "Yes" : "No"}
                </TableCell>
                <TableCell className="text-right">
                  {mode === "edit" && (
                    <ConfirmDeleteButton
                      label="Remove attendee"
                      title={`Remove ${personDisplayName(attendee.person)} from the attendance record?`}
                      description="Attendance is what establishes quorum for this meeting's decisions. It can't be undone."
                      confirmLabel="Remove"
                      pending={isDeleting}
                      onConfirm={() => handleDelete(attendee.id)}
                    />
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
            onSubmit={async (personId, attended) => {
              const result = await createMeetingAttendeeAction(
                meetingId,
                personId,
                attended,
              );
              if (!("error" in result)) refresh();
              return result;
            }}
            onCancel={() => setShowAdd(false)}
          />
        ) : (
          <div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowAdd(true)}
            >
              + Add attendee
            </Button>
          </div>
        ))}
    </div>
  );
}
