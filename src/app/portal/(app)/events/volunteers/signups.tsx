"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { type EventVolunteer } from "../volunteers-actions";
import { type EventShift } from "../shifts-actions";
import { PersonPicker, type PickedPerson } from "../../people/person-picker";
import { type PersonListItem } from "../../people/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatShiftRange, NONE_VALUE } from "./shifts";
import { Spinner } from "@/components/ui/spinner";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";

export function AddVolunteerForm({
  people,
  shifts,
  onPersonCreated,
  onSubmit,
  onCancel,
}: {
  people: PersonListItem[];
  shifts: EventShift[];
  onPersonCreated: (person: PickedPerson) => void;
  onSubmit: (
    personId: string,
    formData: FormData,
  ) => Promise<{ error: string } | { success: true }>;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [selectedPerson, setSelectedPerson] = useState<PickedPerson | null>(
    null,
  );
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [role, setRole] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!selectedPerson) {
      setError("Select or create a person to link.");
      return;
    }

    const formData = new FormData();
    formData.set("role", shiftId ? "" : role);
    formData.set("notes", notes);
    formData.set("shiftId", shiftId ?? "");

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
            onSelect={setSelectedPerson}
            onPersonCreated={onPersonCreated}
            newPersonRole="is_volunteer"
          />
        </Field>

        {shifts.length > 0 && (
          <Field>
            <FieldLabel htmlFor="volunteer-shift">Shift</FieldLabel>
            <Select
              value={shiftId ?? NONE_VALUE}
              onValueChange={(value) =>
                setShiftId(value === NONE_VALUE ? null : value)
              }
            >
              <SelectTrigger id="volunteer-shift" className="w-full">
                <SelectValue placeholder="No shift (whole event)">
                  {(value: string) =>
                    shifts.find((s) => s.id === value)?.label ??
                    "No shift (whole event)"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>
                  No shift (whole event)
                </SelectItem>
                {shifts.map((shift) => (
                  <SelectItem key={shift.id} value={shift.id}>
                    {shift.label} ({formatShiftRange(shift)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        {shiftId ? (
          <Field>
            <FieldLabel>Role</FieldLabel>
            <p className="app-muted rounded-md border border-[var(--line)] px-3 py-2 text-sm">
              {shifts.find((s) => s.id === shiftId)?.role_type?.name ??
                "No role"}
            </p>
          </Field>
        ) : (
          <Field>
            <FieldLabel htmlFor="volunteer-role">Role</FieldLabel>
            <Input
              id="volunteer-role"
              placeholder="e.g. Ride Buddy, Event Setup, Basecamp Staffing"
              value={role}
              onChange={(event) => setRole(event.target.value)}
            />
          </Field>
        )}

        <Field>
          <FieldLabel htmlFor="volunteer-notes">Notes</FieldLabel>
          <Textarea
            id="volunteer-notes"
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
              "Add volunteer"
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function SignupsSection({
  volunteers,
  shifts,
  people,
  mode,
  isDeleting,
  loading,
  showAddVolunteer,
  onToggleAddVolunteer,
  onPersonCreated,
  onCreateVolunteer,
  onDeleteVolunteer,
  onShiftReassign,
}: {
  volunteers: EventVolunteer[];
  shifts: EventShift[];
  people: PersonListItem[];
  mode: "view" | "edit";
  isDeleting: boolean;
  loading: boolean;
  showAddVolunteer: boolean;
  onToggleAddVolunteer: (show: boolean) => void;
  onPersonCreated: (person: PickedPerson) => void;
  onCreateVolunteer: (
    personId: string,
    formData: FormData,
  ) => Promise<{ error: string } | { success: true }>;
  onDeleteVolunteer: (id: string) => void;
  onShiftReassign: (volunteerId: string, shiftId: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-[var(--line)] pt-4">
      <h3 className="text-sm font-semibold">Volunteers signed up</h3>
      {loading ? (
        <TabLoadingSkeleton />
      ) : volunteers.length === 0 && !showAddVolunteer ? (
        <p className="app-muted text-sm">No volunteers recorded yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Volunteer</TableHead>
              <TableHead>Shift</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="w-px" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {volunteers.map((volunteer) => {
              const assignedShift = shifts.find(
                (s) => s.id === volunteer.shift_id,
              );
              const roleLabel = assignedShift
                ? (assignedShift.role_type?.name ?? "No role")
                : volunteer.role || "—";
              return (
                <TableRow key={volunteer.id}>
                  <TableCell
                    className="max-w-xs truncate font-medium"
                    title={volunteer.person?.name ?? undefined}
                  >
                    {volunteer.person?.name ?? "—"}
                  </TableCell>
                  <TableCell className="app-muted">
                    {mode === "edit" && shifts.length > 0 ? (
                      <Select
                        value={volunteer.shift_id ?? NONE_VALUE}
                        onValueChange={(value) =>
                          onShiftReassign(
                            volunteer.id,
                            value === NONE_VALUE ? null : value,
                          )
                        }
                      >
                        <SelectTrigger
                          className="w-full"
                          size="sm"
                          aria-label={`Shift for ${volunteer.person?.name ?? "volunteer"}`}
                        >
                          <SelectValue placeholder="No shift">
                            {(value: string) =>
                              shifts.find((s) => s.id === value)?.label ??
                              "No shift"
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_VALUE}>No shift</SelectItem>
                          {shifts.map((shift) => (
                            <SelectItem key={shift.id} value={shift.id}>
                              {shift.label} ({formatShiftRange(shift)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      (shifts.find((s) => s.id === volunteer.shift_id)?.label ??
                      "—")
                    )}
                  </TableCell>
                  <TableCell className="app-muted">{roleLabel}</TableCell>
                  <TableCell className="text-right">
                    {mode === "edit" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Remove volunteer"
                        disabled={isDeleting}
                        onClick={() => onDeleteVolunteer(volunteer.id)}
                      >
                        {isDeleting ? <Spinner /> : <Trash2 />}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {mode === "edit" &&
        (showAddVolunteer ? (
          <AddVolunteerForm
            people={people}
            shifts={shifts}
            onPersonCreated={onPersonCreated}
            onSubmit={onCreateVolunteer}
            onCancel={() => onToggleAddVolunteer(false)}
          />
        ) : (
          <Button
            type="button"
            variant="secondary"
            className="self-start"
            onClick={() => onToggleAddVolunteer(true)}
          >
            + Add volunteer
          </Button>
        ))}
    </div>
  );
}
