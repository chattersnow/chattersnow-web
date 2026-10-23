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
import { type PersonListItem } from "../../people/actions";
import { listEventPeopleAction } from "../event-people-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { PortalFormPopup } from "@/components/portal/portal-form-surface";

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
  const [canCreatePerson, setCanCreatePerson] = useState(false);
  const [shifts, setShifts] = useState<EventShift[]>([]);
  const [roleTypes, setRoleTypes] = useState<RoleType[]>([]);

  useEffect(() => {
    if (!open) return;
    listEventPeopleAction(eventId).then((result) => {
      if ("error" in result) return;
      setPeople(result.data);
      setCanCreatePerson(result.canCreate);
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
      <PortalFormPopup
        size="lg"
        title="Add a volunteer"
        description="Sign someone up to volunteer at this event."
      >
        <AddVolunteerForm
          allowCreatePerson={canCreatePerson}
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
      </PortalFormPopup>
    </Dialog>
  );
}
