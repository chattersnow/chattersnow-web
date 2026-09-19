"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  EVENT_REGISTRATION_CONFIRMATION_KIND,
  VOLUNTEER_APPLICATION_CONFIRMATION_KIND,
} from "@/lib/notifications/kinds";

/**
 * What actually stops working, per reply.
 *
 * Two of these carry something that exists nowhere else, and a switch that
 * says only "are you sure?" in front of them is a switch that has not been
 * explained. The switch itself stays available either way -- it is the
 * tenant's organization, and there are legitimate reasons to answer a form
 * with silence -- so the dialog's job is to make the decision an informed one
 * rather than to argue with it (#1235).
 */
const CONSEQUENCES: Record<string, string> = {
  [VOLUNTEER_APPLICATION_CONFIRMATION_KIND]:
    "This email carries the applicant's reference code, and it is the only place that code exists. Without it nobody can reach the volunteer status page to check on their application, and because a second application from the same address is refused for 24 hours, they cannot simply apply again to get another one.",
  [EVENT_REGISTRATION_CONFIRMATION_KIND]:
    "This email carries the event's date, place and calendar attachment. Without it somebody who registers has nothing confirming they did, and nothing to add to their calendar.",
};

const GENERAL =
  "Somebody who fills this form in will get no acknowledgement that it arrived.";

export function DisableReplyDialog({
  kind,
  label,
  open,
  onOpenChange,
  onConfirm,
}: {
  kind: string;
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Turn off the {label.toLowerCase()}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {CONSEQUENCES[kind] ?? GENERAL} Your team still gets its own notice
            either way, and you can turn this back on at any time — your wording
            is kept.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep sending it</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Turn it off</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
