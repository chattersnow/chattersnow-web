"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEventChecklistItemAction } from "./checklist-actions";
import { useEventDateDefaults } from "./event-date-defaults";
import { useEventSharedData } from "./event-shared-data";
import { PersonPicker, type PickedPerson } from "../people/person-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { PortalFormSurface } from "@/components/portal/portal-form-surface";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

export function AddChecklistItemDialog({
  eventId,
  triggerLabel = "+ Add item",
  onSaved,
}: {
  eventId: string;
  triggerLabel?: string;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const { people } = useEventSharedData();
  // A new item is due on the event's day unless someone says otherwise.
  const { date: eventDate } = useEventDateDefaults();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState<PickedPerson | null>(null);
  const [dueDate, setDueDate] = useState(eventDate);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setTitle("");
      setOwner(null);
      setDueDate(eventDate);
      setError(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("title", title);
    formData.set("ownerPersonId", owner?.id ?? "");
    formData.set("dueDate", dueDate);

    startTransition(async () => {
      const result = await createEventChecklistItemAction(eventId, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      handleOpenChange(false);
      toast.success("Checklist item added.");
      router.refresh();
      onSaved?.();
    });
  }

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <Button
          type="button"
          variant="secondary"
          className="shrink-0 whitespace-nowrap"
        >
          {triggerLabel}
        </Button>
      }
      title="Add checklist item"
      description="Add a task to this event's checklist."
      size="md"
      onSubmit={handleSubmit}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? <Spinner /> : "Add"}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="checklist-title">Task</FieldLabel>
          <Input
            id="checklist-title"
            autoFocus
            placeholder="Checklist item"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="checklist-owner">Owner</FieldLabel>
          <PersonPicker
            id="checklist-owner"
            people={people.data ?? []}
            selected={owner}
            onSelect={setOwner}
            onPersonCreated={() => {}}
            allowCreate={false}
            placeholder="Search people (optional)"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="checklist-due-date">Due date</FieldLabel>
          <Input
            id="checklist-due-date"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </Field>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </PortalFormSurface>
  );
}
