"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewAssetAction } from "../../actions";
import {
  computeNextReviewDate,
  type Sensitivity,
} from "@/lib/portal/access-management/review-cadence";
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

export function ReviewAssetButton({
  assetId,
  sensitivity,
}: {
  assetId: string;
  sensitivity: Sensitivity;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const previewNextReview = computeNextReviewDate(sensitivity);

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await reviewAssetAction(assetId, sensitivity);
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
      <AlertDialogTrigger render={<Button type="button" variant="secondary" />}>
        Record review
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Record a review for this asset?</AlertDialogTitle>
          <AlertDialogDescription>
            This sets &quot;last reviewed&quot; to today and the next review
            date to {previewNextReview}, based on this asset&apos;s{" "}
            {sensitivity} sensitivity cadence.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isPending}>
            {isPending ? (
              <>
                <Spinner /> Recording...
              </>
            ) : (
              "Record review"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
