"use client";

import { useEffect, useState } from "react";
import { AddHoursForm } from "./hours";
import {
  createEventVolunteerHoursAction,
  listEventVolunteersAction,
  type EventVolunteer,
} from "../volunteers-actions";
import { listEventShiftsAction, type EventShift } from "../shifts-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function LogHoursDialog({
  eventId,
  triggerLabel = "+ Log hours",
  onSaved,
}: {
  eventId: string;
  triggerLabel?: string;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [volunteers, setVolunteers] = useState<EventVolunteer[]>([]);
  const [shifts, setShifts] = useState<EventShift[]>([]);

  useEffect(() => {
    if (!open) return;
    listEventVolunteersAction(eventId).then((result) => {
      if (!("error" in result)) setVolunteers(result.data);
    });
    listEventShiftsAction(eventId).then((result) => {
      if (!("error" in result)) setShifts(result.data);
    });
  }, [open, eventId]);

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
          <DialogTitle>Log volunteer hours</DialogTitle>
          <DialogDescription>
            Log hours for a volunteer signed up at this event.
          </DialogDescription>
        </DialogHeader>

        <AddHoursForm
          volunteers={volunteers}
          shifts={shifts}
          onSubmit={(personId, formData) =>
            createEventVolunteerHoursAction(eventId, personId, formData)
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
