"use client";

import { useEffect, useState } from "react";
import { createEventSponsorAction } from "./sponsors-actions";
import { SponsorForm, emptySponsorForm } from "./sponsors-tab";
import { type PickedPerson } from "../people/person-picker";
import { type PersonListItem } from "../people/actions";
import { listEventPeopleAction } from "./event-people-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { PortalFormPopup } from "@/components/portal/portal-form-surface";

export function AddSponsorDialog({
  eventId,
  triggerLabel = "+ Add sponsor",
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
        size="2xl"
        title="Add a sponsor"
        description="Record a sponsor or partner for this event."
      >
        <SponsorForm
          allowCreatePerson={canCreatePerson}
          initial={emptySponsorForm()}
          submitLabel="Add sponsor"
          onSubmit={(formData, personId) =>
            createEventSponsorAction(eventId, personId!, formData)
          }
          onCancel={() => {
            handleOpenChange(false);
            onSaved?.();
          }}
          people={people}
          onPersonCreated={handlePersonCreated}
        />
      </PortalFormPopup>
    </Dialog>
  );
}
