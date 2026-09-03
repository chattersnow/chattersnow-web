"use client";

import { useEffect, useState } from "react";
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

/**
 * Stops a half-filled form disappearing on an accidental Escape, backdrop
 * click, or tab close.
 *
 * Six edit surfaces already computed an `isDirty` and intercepted close. No
 * create dialog did -- new-expense-dialog resets its form on *open*, so
 * Escape halfway through a long expense (payer, event, amount, category,
 * date, notes) discarded it with no prompt. And there was no `beforeunload`
 * handler anywhere in the app, so a refresh or a back navigation lost
 * in-progress work in create and edit surfaces alike.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) {
      // The browser shows its own wording; preventDefault is what asks for
      // the prompt at all.
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return {
    /** Whether the discard confirmation is currently showing. */
    confirming,
    /**
     * Call from a dialog's `onOpenChange`. Returns false when the close
     * should be intercepted, in which case the confirmation opens instead.
     */
    allowOpenChange(nextOpen: boolean) {
      if (!nextOpen && dirty) {
        setConfirming(true);
        return false;
      }
      return true;
    },
    keepEditing() {
      setConfirming(false);
    },
    discard(close: () => void) {
      setConfirming(false);
      close();
    },
  };
}

export type UnsavedChangesGuard = ReturnType<typeof useUnsavedChangesGuard>;

export function DiscardChangesDialog({
  guard,
  /** What is about to be lost, e.g. "this expense". */
  subject,
  onDiscard,
}: {
  guard: UnsavedChangesGuard;
  subject: string;
  onDiscard: () => void;
}) {
  return (
    <AlertDialog
      open={guard.confirming}
      onOpenChange={(next) => !next && guard.keepEditing()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard changes?</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes to {subject}. Leaving now will discard
            them.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={guard.keepEditing}>
            Keep editing
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => guard.discard(onDiscard)}>
            Discard changes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
