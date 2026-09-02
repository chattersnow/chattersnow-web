"use client";

import { useEffect, useState } from "react";
import { createEventSponsorAction } from "./sponsors-actions";
import { SponsorForm, emptySponsorForm } from "./sponsors-tab";
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

  useEffect(() => {
    if (!open) return;
    listPeopleAction().then((result) => {
      if (!("error" in result)) setPeople(result.data);
    });
  }, [open]);

  function handlePersonCreated(person: PickedPerson) {
    setPeople((prev) => [...prev, { ...person, is_sponsor: true }]);
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
          <DialogTitle>Add a sponsor</DialogTitle>
          <DialogDescription>
            Record a sponsor or partner for this event.
          </DialogDescription>
        </DialogHeader>

        <SponsorForm
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
      </DialogContent>
    </Dialog>
  );
}
