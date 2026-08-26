"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Undo2 } from "lucide-react";
import {
  checkInRegistrantAction,
  createWalkInCheckInAction,
  listEventRegistrantsAction,
  undoCheckInAction,
  type EventRegistrant,
} from "./registrants-actions";
import { PersonPicker, type PickedPerson } from "../people/person-picker";
import { listPeopleAction, type PersonListItem } from "../people/actions";
import { useTabData, useResetOnModeChange } from "@/hooks/use-tab-data";
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

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function WalkInForm({
  eventId,
  people,
  onPersonCreated,
  onSaved,
  onCancel,
}: {
  eventId: string;
  people: PersonListItem[];
  onPersonCreated: (person: PickedPerson) => void;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [selectedPerson, setSelectedPerson] = useState<PickedPerson | null>(
    null,
  );
  const [partySize, setPartySize] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!selectedPerson) {
      setError("Select or create a person to check in.");
      return;
    }
    const size = Number(partySize);
    if (!Number.isInteger(size) || size < 1) {
      setError("Party size must be at least 1.");
      return;
    }

    startTransition(async () => {
      const result = await createWalkInCheckInAction(
        eventId,
        selectedPerson,
        size,
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-md border border-[var(--line)] p-4"
    >
      <FieldGroup>
        <Field>
          <FieldLabel>Walk-in</FieldLabel>
          {/* PersonPicker's "+ Create new person" defaults the Sponsor role
              checkbox on; that's not right for a bare attendee, but there's
              no "attendee" role to default to instead, so staff just leave
              or uncheck it - same tradeoff the picker already makes
              everywhere it's used without a role that fits. */}
          <PersonPicker
            people={people}
            selected={selectedPerson}
            onSelect={setSelectedPerson}
            onPersonCreated={onPersonCreated}
            placeholder="Search by name or email..."
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="walkin-party-size">Party size</FieldLabel>
          <Input
            id="walkin-party-size"
            type="number"
            min={1}
            step={1}
            value={partySize}
            onChange={(event) => setPartySize(event.target.value)}
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
            {isPending ? "Checking in..." : "Check in walk-in"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function RegistrantsTab({
  eventId,
  capacity,
  active,
  mode,
}: {
  eventId: string;
  capacity: number | null;
  active: boolean;
  mode: "view" | "edit";
}) {
  const router = useRouter();
  const {
    data: registrants,
    loadError,
    refresh,
  } = useTabData<EventRegistrant[]>(
    () => listEventRegistrantsAction(eventId),
    active,
    [eventId],
  );
  const { data: people } = useTabData<PersonListItem[]>(
    () => listPeopleAction(),
    active,
  );
  const [peopleOverride, setPeopleOverride] = useState<PersonListItem[]>([]);
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useResetOnModeChange(mode, () => setShowWalkIn(false));

  function handlePersonCreated(person: PickedPerson) {
    setPeopleOverride((prev) => [...prev, { ...person, is_sponsor: false }]);
  }

  function refreshAll() {
    refresh();
    router.refresh();
  }

  function handleToggleCheckIn(registrant: EventRegistrant) {
    setPendingId(registrant.id);
    startTransition(async () => {
      const action = registrant.checked_in_at
        ? undoCheckInAction
        : checkInRegistrantAction;
      await action(registrant.id);
      setPendingId(null);
      refreshAll();
    });
  }

  const list = registrants ?? [];
  const totalAttending = list.reduce(
    (sum, registrant) => sum + registrant.party_size,
    0,
  );
  const checkedInCount = list.filter((r) => r.checked_in_at !== null).length;
  const availablePeople = [...(people ?? []), ...peopleOverride];

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {registrants !== undefined && (
        <p className="app-muted text-sm">
          {list.length} registration{list.length === 1 ? "" : "s"},{" "}
          {totalAttending} attending
          {capacity !== null && ` of ${capacity} capacity`} &middot;{" "}
          {checkedInCount} checked in
        </p>
      )}

      {registrants === undefined ? (
        <p className="app-muted text-sm">Loading registrants...</p>
      ) : list.length === 0 ? (
        <p className="app-muted text-sm">No one has registered yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Party size</TableHead>
              <TableHead>Registered</TableHead>
              <TableHead>Checked in</TableHead>
              {mode === "edit" && <TableHead className="w-px" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((registrant) => (
              <TableRow key={registrant.id}>
                <TableCell
                  className="max-w-xs truncate font-medium"
                  title={registrant.name}
                >
                  {registrant.name}
                </TableCell>
                <TableCell className="app-muted">
                  {registrant.email}
                  {registrant.phone && (
                    <span className="block text-xs">{registrant.phone}</span>
                  )}
                </TableCell>
                <TableCell>{registrant.party_size}</TableCell>
                <TableCell className="app-muted whitespace-nowrap">
                  {dateFormatter.format(new Date(registrant.created_at))}
                </TableCell>
                <TableCell className="app-muted whitespace-nowrap">
                  {registrant.checked_in_at
                    ? dateFormatter.format(new Date(registrant.checked_in_at))
                    : "—"}
                </TableCell>
                {mode === "edit" && (
                  <TableCell className="text-right whitespace-nowrap">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={
                        registrant.checked_in_at ? "Undo check-in" : "Check in"
                      }
                      disabled={isPending && pendingId === registrant.id}
                      onClick={() => handleToggleCheckIn(registrant)}
                    >
                      {registrant.checked_in_at ? <Undo2 /> : <Check />}
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {mode === "edit" &&
        (showWalkIn ? (
          <WalkInForm
            eventId={eventId}
            people={availablePeople}
            onPersonCreated={handlePersonCreated}
            onSaved={() => {
              setShowWalkIn(false);
              refreshAll();
            }}
            onCancel={() => setShowWalkIn(false)}
          />
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowWalkIn(true)}
          >
            + Check in walk-in
          </Button>
        ))}
    </div>
  );
}
