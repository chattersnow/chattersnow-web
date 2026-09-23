"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelMyRegistrationAction } from "./registration-cancel-actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * "I can't make it" (#1418), on a registration of the reader's own that has
 * not started yet. Confirmed first, because there is no undo from here --
 * registering again is.
 */
export function CantMakeItButton({
  registrationId,
  eventId,
  eventName,
}: {
  registrationId: string;
  eventId: string;
  eventName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await cancelMyRegistrationAction(registrationId, eventId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button type="button" variant="outline" size="sm" />}
      >
        I can&apos;t make it
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel your registration?</AlertDialogTitle>
          <AlertDialogDescription>
            Your place at {eventName} will be released for somebody else. You
            can register again while registration is open.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            Keep my place
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            onClick={handleConfirm}
          >
            {isPending ? (
              <>
                <Spinner /> Cancelling...
              </>
            ) : (
              "Cancel registration"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
