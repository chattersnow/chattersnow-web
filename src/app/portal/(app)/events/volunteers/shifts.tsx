"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { type EventShift } from "../shifts-actions";
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

const shiftTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatShiftRange(shift: EventShift) {
  return `${shiftTimeFormatter.format(new Date(shift.starts_at))} – ${shiftTimeFormatter.format(new Date(shift.ends_at))}`;
}

export function AddShiftForm({
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

export function ShiftsSection({
  shifts,
  shiftHeadcounts,
  mode,
  isDeleting,
  showAddShift,
  onToggleAddShift,
  onCreateShift,
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
  onDeleteShift: (id: string) => void;
}) {
  return (
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
                    className={gap ? "text-[var(--destructive)]" : "app-muted"}
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
                        onClick={() => onDeleteShift(shift.id)}
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
