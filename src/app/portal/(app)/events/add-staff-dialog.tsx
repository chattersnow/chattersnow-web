"use client";

import { useEffect, useState } from "react";
import { AddStaffForm } from "./staff-tab";
import { createEventStaffAction } from "./staff-actions";
import { type PickedPerson } from "../people/person-picker";
import { listPeopleAction, type PersonListItem } from "../people/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function AddStaffDialog({
  eventId,
  triggerLabel = "+ Add staff",
  onSaved,
}: {
  eventId: string;
  triggerLabel?: string;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<PersonListItem[]>([]);

  useEffect(() => {
    if (!open) return;
    listPeopleAction().then((result) => {
      if (!("error" in result)) setPeople(result.data);
    });
  }, [open]);

  function handlePersonCreated(person: PickedPerson) {
    setPeople((prev) => [...prev, person]);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="secondary"
            className="shrink-0 whitespace-nowrap"
          />
        }
      >
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add staff</DialogTitle>
          <DialogDescription>
            Assign someone to work this event in a paid or formally-scheduled
            capacity.
          </DialogDescription>
        </DialogHeader>

        <AddStaffForm
          people={people}
          onPersonCreated={handlePersonCreated}
          onSubmit={(personId, formData) =>
            createEventStaffAction(eventId, personId, formData)
          }
          onCancel={() => {
            setOpen(false);
            onSaved?.();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
