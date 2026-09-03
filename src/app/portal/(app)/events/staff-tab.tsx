"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteEventStaffAction,
  listEventStaffAction,
  type EventStaffMember,
} from "./staff-actions";
import { PersonPicker, type PickedPerson } from "../people/person-picker";
import { type PersonListItem } from "../people/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import { EmptyState } from "@/components/portal/empty-state";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import { useTabData } from "@/hooks/use-tab-data";
import { useRegisterTabRefresh } from "@/hooks/use-tab-refresh";
import { personDisplayName } from "@/lib/format";
import type { TabValue } from "./event-tabs-config";

export function AddStaffForm({
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
    <form
      onSubmit={handleSubmit}
      className="rounded-md border border-[var(--line)] p-4"
    >
      <FieldGroup>
        <Field>
          <FieldLabel>Staff member</FieldLabel>
          <PersonPicker
            people={people}
            selected={selectedPerson}
            onSelect={setSelectedPerson}
            onPersonCreated={onPersonCreated}
            newPersonRole="is_staff"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="staff-role">Role</FieldLabel>
          <Input
            id="staff-role"
            placeholder="e.g. Basecamp Lead, Guide, Photographer"
            value={role}
            onChange={(event) => setRole(event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="staff-notes">Notes</FieldLabel>
          <Textarea
            id="staff-notes"
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
              "Add staff"
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function StaffTab({
  eventId,
  active,
  mode,
}: {
  eventId: string;
  active: boolean;
  mode: "view" | "edit";
}) {
  const router = useRouter();
  const {
    data: staff,
    loadError,
    refresh: refreshTabData,
  } = useTabData<EventStaffMember[]>(
    () => listEventStaffAction(eventId),
    active,
    [eventId],
  );
  const [isDeleting, startDeleteTransition] = useTransition();

  function refresh() {
    refreshTabData();
    router.refresh();
  }

  useRegisterTabRefresh<TabValue>("staff", refresh);

  function handleDelete(id: string) {
    startDeleteTransition(async () => {
      await deleteEventStaffAction(id);
      refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {staff === undefined ? (
        <TabLoadingSkeleton />
      ) : staff.length === 0 ? (
        <EmptyState
          title="No staff assigned yet"
          description="Assign the first one with + Add staff above."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Staff member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="w-px" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.map((member) => (
              <TableRow key={member.id}>
                <TableCell
                  className="max-w-xs truncate font-medium"
                  title={member.person?.name ?? undefined}
                >
                  {personDisplayName(member.person)}
                </TableCell>
                <TableCell className="app-muted">
                  {member.role || "—"}
                </TableCell>
                <TableCell className="app-muted max-w-xs truncate">
                  {member.notes || "—"}
                </TableCell>
                <TableCell className="text-right">
                  {mode === "edit" && (
                    <ConfirmDeleteButton
                      label="Remove staff member"
                      title={`Remove ${personDisplayName(member.person)} from this event?`}
                      description="This deletes their staff assignment. It can't be undone."
                      confirmLabel="Remove"
                      pending={isDeleting}
                      onConfirm={() => handleDelete(member.id)}
                    />
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
