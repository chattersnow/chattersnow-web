"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteEventAction } from "../actions";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

/**
 * Deleting an event is only offered while nothing is attached to it. When
 * something is, `blockers` names it and the dialog points at Cancelled/Archived
 * rather than hiding the button -- otherwise a missing affordance leaves no way
 * to find out why. The database trigger is what actually enforces this; the
 * pre-check just spares a round trip.
 */
export function DeleteEventButton({
  eventId,
  eventName,
  blockers,
}: {
  eventId: string;
  eventName: string;
  /** Human-readable labels from the `event_delete_blockers` RPC, e.g. "3 registrants". */
  blockers: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const blocked = blockers.length > 0;

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteEventAction(eventId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.push("/portal/events");
      toast.success("Event deleted.");
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        onClick={() => setOpen(true)}
        aria-label="Delete event"
      >
        <Trash2 /> Delete
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {blocked
                ? `Can't delete "${eventName}"`
                : `Delete "${eventName}"?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {blocked
                ? `This event still has ${blockers.join(", ")} attached to it. Deleting it would destroy or orphan those records, so set its status to Cancelled or Archived instead.`
                : "This permanently removes the event, along with its logistics, impact notes and checklist. It can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              {blocked ? "Close" : "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending || blocked}
            >
              {isPending ? (
                <>
                  <Spinner /> Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
