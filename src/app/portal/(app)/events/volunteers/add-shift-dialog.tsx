"use client";

import { useEffect, useState } from "react";
import { ShiftForm } from "./shifts";
import { createEventShiftAction } from "../shifts-actions";
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

export function AddShiftDialog({
  eventId,
  triggerLabel = "+ Add shift",
  onSaved,
}: {
  eventId: string;
  triggerLabel?: string;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [roleTypes, setRoleTypes] = useState<RoleType[]>([]);

  useEffect(() => {
    if (!open) return;
    listRoleTypesAction().then((result) => {
      if (!("error" in result)) setRoleTypes(result.data);
    });
  }, [open]);

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
          <DialogTitle>Add a shift</DialogTitle>
          <DialogDescription>
            Define a shift volunteers can sign up for.
          </DialogDescription>
        </DialogHeader>

        <ShiftForm
          roleTypes={roleTypes}
          onSubmit={(formData) => createEventShiftAction(eventId, formData)}
          onCancel={() => {
            handleOpenChange(false);
            onSaved?.();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
