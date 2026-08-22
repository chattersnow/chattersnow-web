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
  type EventVolunteer,
  type EventVolunteerHours,
} from "./volunteers-actions";
import { SponsorPersonPicker, type PickedPerson } from "./sponsor-person-picker";
import { listPeopleAction, type PersonListItem } from "../people/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

function AddVolunteerForm({
  people,
  onPersonCreated,
  onSubmit,
  onCancel,
}: {
  people: PersonListItem[];
  onPersonCreated: (person: PickedPerson) => void;
  onSubmit: (personId: string, formData: FormData) => Promise<{ error: string } | { success: true }>;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [selectedPerson, setSelectedPerson] = useState<PickedPerson | null>(null);
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
    <form onSubmit={handleSubmit} className="rounded-md border border-[var(--line)] p-4">
      <FieldGroup>
        <Field>
          <FieldLabel>Volunteer</FieldLabel>
          <SponsorPersonPicker
            people={people}
            selected={selectedPerson}
            onSelect={setSelectedPerson}
            onPersonCreated={onPersonCreated}
          />
        </Field>

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
          <Textarea id="volunteer-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
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
  onSubmit: (personId: string, formData: FormData) => Promise<{ error: string } | { success: true }>;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [selectedPerson, setSelectedPerson] = useState<PickedPerson | null>(null);
  const [hours, setHours] = useState("");
  const [loggedDate, setLoggedDate] = useState(() => new Date().toISOString().slice(0, 10));
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
    <form onSubmit={handleSubmit} className="rounded-md border border-[var(--line)] p-4">
      <FieldGroup>
        <Field>
          <FieldLabel>Volunteer</FieldLabel>
          <SponsorPersonPicker
            people={people}
            selected={selectedPerson}
            onSelect={setSelectedPerson}
            onPersonCreated={onPersonCreated}
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
          <Textarea id="hours-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
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

export function VolunteersTab({ eventId, active, mode }: { eventId: string; active: boolean; mode: "view" | "edit" }) {
  const router = useRouter();
  const [volunteers, setVolunteers] = useState<EventVolunteer[] | null>(null);
  const [hours, setHours] = useState<EventVolunteerHours[] | null>(null);
  const [people, setPeople] = useState<PersonListItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAddVolunteer, setShowAddVolunteer] = useState(false);
  const [showAddHours, setShowAddHours] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [prevMode, setPrevMode] = useState(mode);

  if (mode !== prevMode) {
    setPrevMode(mode);
    if (mode === "view") {
      setShowAddVolunteer(false);
      setShowAddHours(false);
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

  const totalHours = (hours ?? []).reduce((sum, entry) => sum + Number(entry.hours), 0);

  return (
    <div className="flex flex-col gap-6">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-3">
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
                <TableHead>Role</TableHead>
                <TableHead className="w-px" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {volunteers?.map((volunteer) => (
                <TableRow key={volunteer.id}>
                  <TableCell className="font-medium">{volunteer.person?.name ?? "—"}</TableCell>
                  <TableCell className="app-muted">{volunteer.role || "—"}</TableCell>
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
              onPersonCreated={handlePersonCreated}
              onSubmit={(personId, formData) => createEventVolunteerAction(eventId, personId, formData)}
              onCancel={() => {
                setShowAddVolunteer(false);
                refresh();
              }}
            />
          ) : (
            <Button type="button" variant="outline" className="self-start" onClick={() => setShowAddVolunteer(true)}>
              + Add volunteer
            </Button>
          ))}
      </div>

      <div className="flex flex-col gap-3 border-t border-[var(--line)] pt-4">
        <h3 className="text-sm font-semibold">
          Hours logged{hours && hours.length > 0 ? ` (${totalHours} total)` : ""}
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
                  <TableCell className="font-medium">{entry.person?.name ?? "—"}</TableCell>
                  <TableCell className="app-muted">{dateFormatter.format(new Date(entry.logged_date))}</TableCell>
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
              onSubmit={(personId, formData) => createEventVolunteerHoursAction(eventId, personId, formData)}
              onCancel={() => {
                setShowAddHours(false);
                refresh();
              }}
            />
          ) : (
            <Button type="button" variant="outline" className="self-start" onClick={() => setShowAddHours(true)}>
              + Log hours
            </Button>
          ))}
      </div>
    </div>
  );
}
