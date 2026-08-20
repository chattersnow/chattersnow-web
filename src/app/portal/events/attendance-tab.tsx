"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateEventAttendanceAction } from "./actions";
import type { EventRow } from "./event-badges";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function AttendanceTab({ event }: { event: EventRow }) {
  const router = useRouter();
  const [count, setCount] = useState(event.attendance_count?.toString() ?? "");
  const [notes, setNotes] = useState(event.attendance_notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("attendanceCount", count);
    formData.set("attendanceNotes", notes);

    startTransition(async () => {
      const result = await updateEventAttendanceAction(event.id, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="attendance-count">Attendance headcount</FieldLabel>
          <Input
            id="attendance-count"
            type="number"
            min={0}
            step={1}
            placeholder="e.g. 120"
            value={count}
            onChange={(changeEvent) => setCount(changeEvent.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="attendance-notes">Notes</FieldLabel>
          <Textarea
            id="attendance-notes"
            placeholder="How attendance was counted, notable turnout details, etc."
            value={notes}
            onChange={(changeEvent) => setNotes(changeEvent.target.value)}
          />
        </Field>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>

      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save attendance"}
        </Button>
      </DialogFooter>
    </form>
  );
}
