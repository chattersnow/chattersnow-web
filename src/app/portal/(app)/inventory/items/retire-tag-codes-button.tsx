"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
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
import { formatCount, itemTagRetireMessage } from "@/lib/inventory-codes";
import { retireItemTagCodesAction } from "./codes/actions";
import type { InventoryItem } from "./inventory-shared";

/** The selected items that have both a tag code and a numbered code. */
export function itemsWithBothCodes(
  items: readonly Pick<InventoryItem, "assetTag" | "numberedCode">[],
): number {
  return items.filter((item) => item.assetTag && item.numberedCode).length;
}

/**
 * The Items list's bulk clean-up (#1544): retire the random tag code on each
 * selected item that has a numbered code, so it is left with one identity.
 * Items without a numbered code are skipped -- by the database, whatever the
 * selection says -- so nothing is left untagged.
 */
export function RetireTagCodesButton({
  items,
  onDone,
}: {
  items: InventoryItem[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const eligible = itemsWithBothCodes(items);
  const skipped = items.length - eligible;

  if (eligible === 0) return null;

  function retire() {
    setError(null);
    startTransition(async () => {
      const result = await retireItemTagCodesAction(
        items.map((item) => item.id),
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success(itemTagRetireMessage(result));
      setOpen(false);
      onDone();
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
      >
        <Ban /> Retire tag codes
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Retire the tag code on {formatCount(eligible, "item")}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {eligible === 1
                ? "This item keeps its"
                : "These items keep their"}{" "}
              numbered code. The old tag code stops working: scanning it finds
              nothing, and it can&apos;t be put on another item. Take the old
              labels off.
              {skipped > 0 &&
                ` ${formatCount(skipped, "selected item")} without both codes ${
                  skipped === 1 ? "is" : "are"
                } skipped.`}
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
              onClick={retire}
              disabled={isPending}
            >
              {isPending && <Spinner />} Retire tag codes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
