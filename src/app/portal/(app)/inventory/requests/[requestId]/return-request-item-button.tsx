"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { returnGearRequestItemAction } from "../actions";
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
 * Put an item from a fulfilled request back on the shelf when it was not
 * actually handed over (#1567). The request stays fulfilled; there is no
 * reopening one.
 */
export function ReturnRequestItemButton({
  requestId,
  itemId,
  itemLabel,
}: {
  requestId: string;
  itemId: string;
  itemLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleReturn() {
    setError(null);
    startTransition(async () => {
      await runAction(() => returnGearRequestItemAction(requestId, itemId), {
        success: `${itemLabel} is back on the shelf.`,
        onError: setError,
        onSuccess: () => {
          setOpen(false);
          router.refresh();
        },
      });
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Return ${itemLabel} to the shelf`}
          />
        }
      >
        Return to shelf
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Return {itemLabel} to the shelf?</AlertDialogTitle>
          <AlertDialogDescription>
            Use this when it was not actually handed over. It goes back on the
            shelf, where anyone can request it, and no longer counts as
            received. The request stays fulfilled.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Keep it</AlertDialogCancel>
          <AlertDialogAction onClick={handleReturn} disabled={isPending}>
            {isPending ? <Spinner className="size-4" /> : null}
            Return to shelf
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
