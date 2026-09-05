"use client";

import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { AddHoursForm } from "./hours";
import {
  createEventVolunteerHoursAction,
  listEventVolunteersAction,
  type EventVolunteer,
} from "../volunteers-actions";
import { listEventShiftsAction, type EventShift } from "../shifts-actions";
import {
  listRoleTypesAction,
  type RoleType,
} from "../../volunteers/roles/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

export function LogHoursDialog({
  eventId,
  triggerLabel = "+ Log hours",
  triggerRender,
  personId,
  onSaved,
}: {
  eventId: string;
  triggerLabel?: ReactNode;
  /**
   * The element the trigger renders as. Defaults to the secondary button the
   * card headers use; roster rows pass an icon button instead.
   */
  triggerRender?: ReactElement;
  /** Opens with this volunteer fixed, for a trigger that sits on their row. */
  personId?: string;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [volunteers, setVolunteers] = useState<EventVolunteer[]>([]);
  const [shifts, setShifts] = useState<EventShift[]>([]);
  const [roleTypes, setRoleTypes] = useState<RoleType[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([
      listEventVolunteersAction(eventId),
      listEventShiftsAction(eventId),
      listRoleTypesAction(),
    ]).then(([volunteersResult, shiftsResult, roleTypesResult]) => {
      if (cancelled) return;
      if (!("error" in volunteersResult)) setVolunteers(volunteersResult.data);
      if (!("error" in shiftsResult)) setShifts(shiftsResult.data);
      if (!("error" in roleTypesResult)) setRoleTypes(roleTypesResult.data);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open, eventId]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
  }

  const lockedPerson = personId
    ? volunteers.find((volunteer) => volunteer.person_id === personId)?.person
    : undefined;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          triggerRender ?? (
            <Button
              type="button"
              variant="secondary"
              className="shrink-0 whitespace-nowrap"
            />
          )
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

        {/* The form seeds its hours, date and role from the volunteer's signup
            on its first render, so it must not mount before they arrive. */}
        {loaded ? (
          <AddHoursForm
            key={personId ?? "picker"}
            volunteers={volunteers}
            shifts={shifts}
            roleTypes={roleTypes}
            lockedPerson={lockedPerson}
            onSubmit={(personIdToLog, formData) =>
              createEventVolunteerHoursAction(eventId, personIdToLog, formData)
            }
            onCancel={() => {
              handleOpenChange(false);
              onSaved?.();
            }}
          />
        ) : (
          <p className="app-muted flex items-center gap-2 p-4 text-sm">
            <Spinner /> Loading volunteers...
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
