"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { SlotChange } from "./content-diff";

/**
 * What is about to go live, before it does (#793).
 *
 * Publishing used to be the same gesture as saving, so there was nothing to
 * confirm and nothing to show. Now that the two are separate, the moment that
 * matters is worth a list of exactly which words change -- shown the way the
 * audit log shows one, the copy being replaced struck through above the copy
 * replacing it.
 */
export function PublishChangesDialog({
  open,
  onOpenChange,
  changes,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  changes: readonly SlotChange[];
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {changes.length === 1
              ? "Publish this change?"
              : `Publish ${changes.length} changes?`}
          </DialogTitle>
          <DialogDescription>
            This replaces the copy on the public website straight away.
          </DialogDescription>
        </DialogHeader>

        {changes.length === 0 ? (
          <Alert>
            <AlertDescription>
              Nothing here reads differently from what is already published.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            {changes.map((change) => (
              <div
                key={change.slot.key}
                className="rounded-lg border border-[var(--line)] p-3"
              >
                <p className="font-medium">
                  {change.slot.label}
                  {change.toDefault && (
                    <span className="app-muted ml-2 text-xs font-normal">
                      back to the default wording
                    </span>
                  )}
                </p>
                {change.before.length > 0 && (
                  <ul className="app-muted mt-2 space-y-1 line-through">
                    {change.before.map((line, index) => (
                      <li key={index}>{line}</li>
                    ))}
                  </ul>
                )}
                {change.after.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {change.after.map((line, index) => (
                      <li key={index}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="app-muted mt-2">Nothing will be shown here.</p>
                )}
              </div>
            ))}
          </div>
        )}

        <DialogFooter showCloseButton>
          <Button
            type="button"
            disabled={pending || changes.length === 0}
            onClick={onConfirm}
          >
            {pending ? (
              <>
                <Spinner /> Publishing...
              </>
            ) : (
              "Publish"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
