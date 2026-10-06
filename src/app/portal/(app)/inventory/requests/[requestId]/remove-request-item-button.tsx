"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeGearRequestItemAction } from "../actions";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";

/**
 * Take one held item off an open request and put it back on the shelf
 * (#1527). The last item cannot go: an empty request is a cancellation, and
 * the status actions already say so.
 */
export function RemoveRequestItemButton({
  requestId,
  itemId,
  itemLabel,
  isLast,
}: {
  requestId: string;
  itemId: string;
  itemLabel: string;
  isLast: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      await runAction(() => removeGearRequestItemAction(requestId, itemId), {
        success: `${itemLabel} is back on the shelf.`,
        onError: setError,
        onSuccess: () => {
          setOpen(false);
          router.refresh();
        },
      });
    });
  }

  if (isLast) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled
        title="The last item can't be removed. Cancel the request instead."
      >
        Remove
      </Button>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Remove ${itemLabel}`}
          />
        }
      >
        Remove
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {itemLabel}?</AlertDialogTitle>
          <AlertDialogDescription>
            It comes off this request and goes back on the shelf, where anyone
            can request it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleRemove}
            disabled={isPending}
          >
            {isPending ? <Spinner className="size-4" /> : null}
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
