"use client";

import { useEffect, useState } from "react";
import { AddVolunteerForm } from "./signups";
import { createEventVolunteerAction } from "../volunteers-actions";
import { listEventShiftsAction, type EventShift } from "../shifts-actions";
import {
  listRoleTypesAction,
  type RoleType,
} from "../../volunteers/roles/actions";
import { type PickedPerson } from "../../people/person-picker";
import { listPeopleAction, type PersonListItem } from "../../people/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function AddVolunteerDialog({
  eventId,
  triggerLabel = "+ Add volunteer",
  onSaved,
}: {
  eventId: string;
  triggerLabel?: string;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<PersonListItem[]>([]);
  const [shifts, setShifts] = useState<EventShift[]>([]);
  const [roleTypes, setRoleTypes] = useState<RoleType[]>([]);

  useEffect(() => {
    if (!open) return;
    listPeopleAction().then((result) => {
      if (!("error" in result)) setPeople(result.data);
    });
    listEventShiftsAction(eventId).then((result) => {
      if (!("error" in result)) setShifts(result.data);
    });
    listRoleTypesAction().then((result) => {
      if (!("error" in result)) setRoleTypes(result.data);
    });
  }, [open, eventId]);

  function handlePersonCreated(person: PickedPerson) {
    setPeople((prev) => [...prev, person]);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
          <DialogTitle>Add a volunteer</DialogTitle>
          <DialogDescription>
            Sign someone up to volunteer at this event.
          </DialogDescription>
        </DialogHeader>

        <AddVolunteerForm
          people={people}
          shifts={shifts}
          roleTypes={roleTypes}
          onPersonCreated={handlePersonCreated}
          onSubmit={(personId, formData) =>
            createEventVolunteerAction(eventId, personId, formData)
          }
          onCancel={() => {
            handleOpenChange(false);
            onSaved?.();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
