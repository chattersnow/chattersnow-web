"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteDistributionAction } from "../actions";
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

export function DeleteDistributionButton({
  movementId,
  itemDescription,
}: {
  movementId: string;
  itemDescription: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteDistributionAction(movementId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.push("/portal/inventory/distribution");
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        onClick={() => setOpen(true)}
        aria-label="Delete distribution"
      >
        <Trash2 /> Delete
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this distribution?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the distribution record for &quot;
              {itemDescription}&quot; from the item&apos;s movement history. It
              does not change the item&apos;s current status. This can&apos;t be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
