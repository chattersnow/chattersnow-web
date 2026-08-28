"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { type EventShift } from "../shifts-actions";
import {
  listRoleTypesAction,
  type RoleType,
} from "../../volunteers/roles/actions";
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

export const NONE_VALUE = "none";

const shiftTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatShiftRange(shift: EventShift) {
  return `${shiftTimeFormatter.format(new Date(shift.starts_at))} – ${shiftTimeFormatter.format(new Date(shift.ends_at))}`;
}

function toDatetimeLocal(iso: string) {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ShiftForm({
  initialShift,
  roleTypes,
  onSubmit,
  onCancel,
}: {
  initialShift?: EventShift;
  roleTypes: RoleType[];
  onSubmit: (
    formData: FormData,
  ) => Promise<{ error: string } | { success: true }>;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [label, setLabel] = useState(initialShift?.label ?? "");
  const [startsAt, setStartsAt] = useState(
    initialShift ? toDatetimeLocal(initialShift.starts_at) : "",
  );
  const [endsAt, setEndsAt] = useState(
    initialShift ? toDatetimeLocal(initialShift.ends_at) : "",
  );
  const [targetHeadcount, setTargetHeadcount] = useState(
    initialShift?.target_headcount != null
      ? String(initialShift.target_headcount)
      : "",
  );
  const [notes, setNotes] = useState(initialShift?.notes ?? "");
  const [volunteerRoleTypeId, setVolunteerRoleTypeId] = useState(
    initialShift?.volunteer_role_type_id ?? NONE_VALUE,
  );
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
    formData.set(
      "volunteerRoleTypeId",
      volunteerRoleTypeId === NONE_VALUE ? "" : volunteerRoleTypeId,
    );

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
          <FieldLabel htmlFor="shift-role">Role</FieldLabel>
          <Select
            value={volunteerRoleTypeId}
            onValueChange={(value) =>
              setVolunteerRoleTypeId(value ?? NONE_VALUE)
            }
          >
            <SelectTrigger id="shift-role" className="w-full">
              <SelectValue placeholder="No role">
                {(value: string) =>
                  value === NONE_VALUE
                    ? "No role"
                    : (roleTypes.find((option) => option.id === value)?.name ??
                      "No role")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>No role</SelectItem>
              {roleTypes.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            {isPending
              ? "Saving..."
              : initialShift
                ? "Save changes"
                : "Add shift"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function ShiftsSection({
  shifts,
  shiftHeadcounts,
  mode,
  isDeleting,
  showAddShift,
  onToggleAddShift,
  onCreateShift,
  onUpdateShift,
  onDeleteShift,
}: {
  shifts: EventShift[];
  shiftHeadcounts: Map<string, number>;
  mode: "view" | "edit";
  isDeleting: boolean;
  showAddShift: boolean;
  onToggleAddShift: (show: boolean) => void;
  onCreateShift: (
    formData: FormData,
  ) => Promise<{ error: string } | { success: true }>;
  onUpdateShift: (
    id: string,
    formData: FormData,
  ) => Promise<{ error: string } | { success: true }>;
  onDeleteShift: (id: string) => void;
}) {
  const [roleTypes, setRoleTypes] = useState<RoleType[]>([]);
  const [roleTypesError, setRoleTypesError] = useState<string | null>(null);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);

  useEffect(() => {
    listRoleTypesAction().then((result) => {
      if ("error" in result) {
        setRoleTypesError(result.error);
      } else {
        setRoleTypes(result.data);
      }
    });
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Shifts</h3>
      {roleTypesError && (
        <Alert variant="destructive">
          <AlertDescription>{roleTypesError}</AlertDescription>
        </Alert>
      )}
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
              <TableHead>Role</TableHead>
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

              if (editingShiftId === shift.id) {
                return (
                  <TableRow key={shift.id}>
                    <TableCell colSpan={5} className="p-0">
                      <div className="p-3">
                        <ShiftForm
                          initialShift={shift}
                          roleTypes={roleTypes}
                          onSubmit={(formData) =>
                            onUpdateShift(shift.id, formData)
                          }
                          onCancel={() => setEditingShiftId(null)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              }

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
                  <TableCell className="app-muted">
                    {shift.role_type?.name ?? "—"}
                  </TableCell>
                  <TableCell
                    className={gap ? "text-[var(--destructive)]" : "app-muted"}
                  >
                    {shift.target_headcount !== null
                      ? `${assigned} / ${shift.target_headcount}`
                      : assigned}
                    {gap ? " — gap" : ""}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {mode === "edit" && (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Edit shift"
                          onClick={() => setEditingShiftId(shift.id)}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remove shift"
                          disabled={isDeleting}
                          onClick={() => onDeleteShift(shift.id)}
                        >
                          <Trash2 />
                        </Button>
                      </>
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
          <ShiftForm
            roleTypes={roleTypes}
            onSubmit={onCreateShift}
            onCancel={() => onToggleAddShift(false)}
          />
        ) : (
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() => onToggleAddShift(true)}
          >
            + Add shift
          </Button>
        ))}
    </div>
  );
}
