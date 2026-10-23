"use client";

import { useEffect, useState } from "react";
import { AddStaffForm } from "./staff-tab";
import { createEventStaffAction } from "./staff-actions";
import { type PickedPerson } from "../people/person-picker";
import { type PersonListItem } from "../people/actions";
import { listEventPeopleAction } from "./event-people-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { PortalFormPopup } from "@/components/portal/portal-form-surface";

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
  const [canCreatePerson, setCanCreatePerson] = useState(false);

  useEffect(() => {
    if (!open) return;
    listEventPeopleAction(eventId).then((result) => {
      if ("error" in result) return;
      setPeople(result.data);
      setCanCreatePerson(result.canCreate);
    });
  }, [open, eventId]);

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
      <PortalFormPopup
        size="lg"
        title="Add staff"
        description="Assign someone to work this event in a paid or formally-scheduled capacity."
      >
        <AddStaffForm
          allowCreatePerson={canCreatePerson}
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
      </PortalFormPopup>
    </Dialog>
  );
}
