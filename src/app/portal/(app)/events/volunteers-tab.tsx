"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  createEventVolunteerAction,
  createEventVolunteerHoursAction,
  deleteEventVolunteerAction,
  deleteEventVolunteerHoursAction,
  listEventVolunteerHoursAction,
  listEventVolunteersAction,
  updateEventVolunteerShiftAction,
  type EventVolunteer,
  type EventVolunteerHours,
} from "./volunteers-actions";
import {
  createEventShiftAction,
  deleteEventShiftAction,
  listEventShiftsAction,
  type EventShift,
} from "./shifts-actions";
import { PersonPicker, type PickedPerson } from "../people/person-picker";
import { listPeopleAction, type PersonListItem } from "../people/actions";
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

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
const shiftTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatShiftRange(shift: EventShift) {
  return `${shiftTimeFormatter.format(new Date(shift.starts_at))} – ${shiftTimeFormatter.format(new Date(shift.ends_at))}`;
}

function AddShiftForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (
    formData: FormData,
  ) => Promise<{ error: string } | { success: true }>;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [targetHeadcount, setTargetHeadcount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("label", label);
    formData.set("startsAt", startsAt);
    formData.set("endsAt", endsAt);
    formData.set("targetHeadcount", targetHeadcount);
    formData.set("notes", notes);

    startTransition(async () => {
      const result = await onSubmit(formData);
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
          <FieldLabel htmlFor="shift-label">Duty / location</FieldLabel>
          <Input
            id="shift-label"
            placeholder="e.g. Basecamp AM"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </Field>

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="shift-startsAt">Starts</FieldLabel>
            <Input
              id="shift-startsAt"
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="shift-endsAt">Ends</FieldLabel>
            <Input
              id="shift-endsAt"
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </Field>
        </Field>

        <Field>
          <FieldLabel htmlFor="shift-targetHeadcount">
            Target headcount
          </FieldLabel>
          <Input
            id="shift-targetHeadcount"
            type="number"
            min="1"
            step="1"
            placeholder="Optional"
            value={targetHeadcount}
            onChange={(event) => setTargetHeadcount(event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="shift-notes">Notes</FieldLabel>
          <Textarea
            id="shift-notes"
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
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Add shift"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

function AddVolunteerForm({
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
    formData.set("role", role);
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
              value={shiftId}
              onValueChange={(value) => setShiftId(value)}
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
                {shifts.map((shift) => (
                  <SelectItem key={shift.id} value={shift.id}>
                    {shift.label} ({formatShiftRange(shift)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        <Field>
          <FieldLabel htmlFor="volunteer-role">Role</FieldLabel>
          <Input
            id="volunteer-role"
            placeholder="e.g. Ride Buddy, Event Setup, Basecamp Staffing"
            value={role}
            onChange={(event) => setRole(event.target.value)}
          />
        </Field>

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
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Add volunteer"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

function AddHoursForm({
  people,
  onPersonCreated,
  onSubmit,
  onCancel,
}: {
  people: PersonListItem[];
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
  const [hours, setHours] = useState("");
  const [loggedDate, setLoggedDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!selectedPerson) {
      setError("Select or create a person to log hours for.");
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
            onSelect={setSelectedPerson}
            onPersonCreated={onPersonCreated}
            newPersonRole="is_volunteer"
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
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Log hours"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function VolunteersTab({
  eventId,
  active,
  mode,
}: {
  eventId: string;
  active: boolean;
  mode: "view" | "edit";
}) {
  const router = useRouter();
  const [volunteers, setVolunteers] = useState<EventVolunteer[] | null>(null);
  const [hours, setHours] = useState<EventVolunteerHours[] | null>(null);
  const [shifts, setShifts] = useState<EventShift[]>([]);
  const [people, setPeople] = useState<PersonListItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAddVolunteer, setShowAddVolunteer] = useState(false);
  const [showAddHours, setShowAddHours] = useState(false);
  const [showAddShift, setShowAddShift] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [prevMode, setPrevMode] = useState(mode);

  if (mode !== prevMode) {
    setPrevMode(mode);
    if (mode === "view") {
      setShowAddVolunteer(false);
      setShowAddHours(false);
      setShowAddShift(false);
    }
  }

  function load() {
    listEventVolunteersAction(eventId).then((result) => {
      if ("error" in result) setLoadError(result.error);
      else setVolunteers(result.data);
    });
    listEventVolunteerHoursAction(eventId).then((result) => {
      if (!("error" in result)) setHours(result.data);
    });
    listEventShiftsAction(eventId).then((result) => {
      if (!("error" in result)) setShifts(result.data);
    });
    listPeopleAction().then((result) => {
      if (!("error" in result)) setPeople(result.data);
    });
  }

  useEffect(() => {
    if (!active) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, eventId]);

  function refresh() {
    load();
    router.refresh();
  }

  function handlePersonCreated(person: PickedPerson) {
    setPeople((prev) => [...prev, { ...person, is_sponsor: false }]);
  }

  function handleDeleteVolunteer(id: string) {
    startDeleteTransition(async () => {
      await deleteEventVolunteerAction(id);
      refresh();
    });
  }

  function handleDeleteHours(id: string) {
    startDeleteTransition(async () => {
      await deleteEventVolunteerHoursAction(id);
      refresh();
    });
  }

  function handleDeleteShift(id: string) {
    startDeleteTransition(async () => {
      await deleteEventShiftAction(id);
      refresh();
    });
  }

  function handleShiftReassign(volunteerId: string, shiftId: string | null) {
    startDeleteTransition(async () => {
      await updateEventVolunteerShiftAction(volunteerId, shiftId);
      refresh();
    });
  }

  const totalHours = (hours ?? []).reduce(
    (sum, entry) => sum + Number(entry.hours),
    0,
  );
  const shiftHeadcounts = new Map<string, number>();
  for (const volunteer of volunteers ?? []) {
    if (!volunteer.shift_id) continue;
    shiftHeadcounts.set(
      volunteer.shift_id,
      (shiftHeadcounts.get(volunteer.shift_id) ?? 0) + 1,
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Shifts</h3>
        {shifts.length === 0 && !showAddShift ? (
          <p className="app-muted text-sm">
            No shifts defined. Volunteers can still be signed up for the whole
            event.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Duty / location</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Signed up</TableHead>
                <TableHead className="w-px" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {shifts.map((shift) => {
                const assigned = shiftHeadcounts.get(shift.id) ?? 0;
                const gap =
                  shift.target_headcount !== null &&
                  assigned < shift.target_headcount;
                return (
                  <TableRow key={shift.id}>
                    <TableCell
                      className="max-w-xs truncate font-medium"
                      title={shift.label}
                    >
                      {shift.label}
                    </TableCell>
                    <TableCell className="app-muted">
                      {formatShiftRange(shift)}
                    </TableCell>
                    <TableCell
                      className={
                        gap ? "text-[var(--destructive)]" : "app-muted"
                      }
                    >
                      {shift.target_headcount !== null
                        ? `${assigned} / ${shift.target_headcount}`
                        : assigned}
                      {gap ? " — gap" : ""}
                    </TableCell>
                    <TableCell className="text-right">
                      {mode === "edit" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remove shift"
                          disabled={isDeleting}
                          onClick={() => handleDeleteShift(shift.id)}
                        >
                          <Trash2 />
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
          (showAddShift ? (
            <AddShiftForm
              onSubmit={(formData) => createEventShiftAction(eventId, formData)}
              onCancel={() => {
                setShowAddShift(false);
                refresh();
              }}
            />
          ) : (
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={() => setShowAddShift(true)}
            >
              + Add shift
            </Button>
          ))}
      </div>

      <div className="flex flex-col gap-3 border-t border-[var(--line)] pt-4">
        <h3 className="text-sm font-semibold">Volunteers signed up</h3>
        {volunteers === null ? (
          <p className="app-muted text-sm">Loading volunteers...</p>
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
              {volunteers?.map((volunteer) => (
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
                        value={volunteer.shift_id}
                        onValueChange={(value) =>
                          handleShiftReassign(volunteer.id, value)
                        }
                      >
                        <SelectTrigger className="w-full" size="sm">
                          <SelectValue placeholder="No shift">
                            {(value: string) =>
                              shifts.find((s) => s.id === value)?.label ??
                              "No shift"
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
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
                  <TableCell className="app-muted">
                    {volunteer.role || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {mode === "edit" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Remove volunteer"
                        disabled={isDeleting}
                        onClick={() => handleDeleteVolunteer(volunteer.id)}
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
          (showAddVolunteer ? (
            <AddVolunteerForm
              people={people}
              shifts={shifts}
              onPersonCreated={handlePersonCreated}
              onSubmit={(personId, formData) =>
                createEventVolunteerAction(eventId, personId, formData)
              }
              onCancel={() => {
                setShowAddVolunteer(false);
                refresh();
              }}
            />
          ) : (
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={() => setShowAddVolunteer(true)}
            >
              + Add volunteer
            </Button>
          ))}
      </div>

      <div className="flex flex-col gap-3 border-t border-[var(--line)] pt-4">
        <h3 className="text-sm font-semibold">
          Hours logged
          {hours && hours.length > 0 ? ` (${totalHours} total)` : ""}
        </h3>
        {hours === null ? (
          <p className="app-muted text-sm">Loading hours...</p>
        ) : hours.length === 0 && !showAddHours ? (
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
              {hours?.map((entry) => (
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
                        onClick={() => handleDeleteHours(entry.id)}
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
          (showAddHours ? (
            <AddHoursForm
              people={people}
              onPersonCreated={handlePersonCreated}
              onSubmit={(personId, formData) =>
                createEventVolunteerHoursAction(eventId, personId, formData)
              }
              onCancel={() => {
                setShowAddHours(false);
                refresh();
              }}
            />
          ) : (
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={() => setShowAddHours(true)}
            >
              + Log hours
            </Button>
          ))}
      </div>
    </div>
  );
}
