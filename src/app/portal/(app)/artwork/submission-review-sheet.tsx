"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Eye } from "lucide-react";
import {
  deleteArtworkSubmissionAction,
  updateArtworkSubmissionStatusAction,
} from "./actions";
import {
  ARTWORK_SUBMISSION_STATUSES,
  SUBMISSION_PARAM,
  type ArtworkSubmission,
  type ArtworkSubmissionStatus,
  type SignedArtworkImage,
} from "./submission-types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { humanizeStatus } from "@/components/portal/status-badge";
import { formatDateTime } from "@/lib/format";
import { useDeepLinkedSheet } from "@/components/portal/use-deep-linked-sheet";

const STATUS_ITEMS = ARTWORK_SUBMISSION_STATUSES.map((status) => ({
  value: status,
  label: humanizeStatus(status),
}));

export function ArtworkSubmissionReviewSheet({
  submission,
  images,
  canManage,
  defaultOpen = false,
  withTrigger = true,
}: {
  submission: ArtworkSubmission;
  images: SignedArtworkImage[];
  canManage: boolean;
  /** True when `?submission=` names this row. */
  defaultOpen?: boolean;
  /**
   * False for the sheet the page renders when the linked submission is not on
   * the current page of the list -- there is no card to hang a trigger off.
   */
  withTrigger?: boolean;
}) {
  const router = useRouter();
  const { open, onOpenChange } = useDeepLinkedSheet(
    SUBMISSION_PARAM,
    defaultOpen,
  );
  const [status, setStatus] = useState<ArtworkSubmissionStatus>(
    submission.status,
  );
  const [notes, setNotes] = useState(submission.review_notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const label = submission.title || `Untitled, ${submission.submitter_name}`;

  function save(nextStatus: ArtworkSubmissionStatus) {
    setError(null);
    startTransition(async () => {
      const result = await updateArtworkSubmissionStatusAction(
        submission.id,
        nextStatus,
        notes,
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Submission updated.");
      router.refresh();
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteArtworkSubmissionAction(submission.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Submission deleted.");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {withTrigger ? (
        <Tooltip>
          <SheetTrigger
            render={
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Review ${label}`}
                  />
                }
              />
            }
          >
            <Eye />
          </SheetTrigger>
          <TooltipContent>{`Review ${label}`}</TooltipContent>
        </Tooltip>
      ) : null}
      <SheetContent side="right" showCloseButton={false}>
        <SheetHeader className="flex-row items-start gap-2 space-y-0">
          <Tooltip>
            <SheetClose
              render={
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Close"
                    />
                  }
                />
              }
            >
              <ArrowLeft />
            </SheetClose>
            <TooltipContent>Close</TooltipContent>
          </Tooltip>
          <div className="flex flex-1 flex-col gap-0.5">
            <SheetTitle>{submission.title || "Untitled"}</SheetTitle>
            <SheetDescription>
              Submitted {formatDateTime(submission.created_at)}
            </SheetDescription>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <FieldGroup>
            <ul className="flex flex-col gap-3">
              {images.map((image, index) => (
                <li key={image.id}>
                  {image.thumbUrl ? (
                    // A signed URL whose token rotates hourly: next/image would
                    // cache a key that is stale by the next render and burn
                    // optimization quota to no end. See signed-images.ts.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={image.thumbUrl}
                      alt={`${label}, image ${index + 1}`}
                      className="w-full rounded-lg border border-[var(--line)] bg-muted object-contain"
                    />
                  ) : (
                    <div className="app-muted rounded-lg border border-[var(--line)] p-4 text-sm">
                      This preview could not be loaded.
                    </div>
                  )}
                  {image.originalUrl ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1"
                      nativeButton={false}
                      render={
                        // The full-resolution file, which is what the zine is
                        // laid out from. Opens in a new tab rather than
                        // downloading: the signed URL is what makes it
                        // reachable at all, and a download attribute on a
                        // cross-origin href is ignored anyway.
                        <a
                          href={image.originalUrl}
                          target="_blank"
                          rel="noreferrer"
                        />
                      }
                    >
                      <Download />
                      Open full size
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>

            <ReadOnlyField label="Artist" htmlFor="submission-artist">
              {submission.submitter_name}
            </ReadOnlyField>
            <ReadOnlyField label="Email" htmlFor="submission-email">
              {submission.submitter_email}
            </ReadOnlyField>
            <ReadOnlyField label="For" htmlFor="submission-event">
              {submission.event?.name || "—"}
            </ReadOnlyField>
            <ReadOnlyField label="Medium" htmlFor="submission-medium">
              {submission.medium || "—"}
            </ReadOnlyField>
            <ReadOnlyField label="About the work" htmlFor="submission-about">
              {submission.artist_statement || "—"}
            </ReadOnlyField>

            {canManage ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Status</span>
                  <Select
                    value={status}
                    items={STATUS_ITEMS}
                    onValueChange={(value) => {
                      if (!value) return;
                      const next = value as ArtworkSubmissionStatus;
                      setStatus(next);
                      save(next);
                    }}
                    disabled={isPending}
                  >
                    <SelectTrigger aria-label="Submission status">
                      {isPending ? <Spinner /> : null}
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="submission-notes"
                    className="text-sm font-medium"
                  >
                    Internal notes
                  </label>
                  <Textarea
                    id="submission-notes"
                    rows={4}
                    maxLength={2000}
                    value={notes}
                    disabled={isPending}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={isPending}
                      onClick={() => save(status)}
                    >
                      Save notes
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={handleDelete}
                    >
                      Delete submission
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <ReadOnlyField label="Status" htmlFor="submission-status">
                  {humanizeStatus(submission.status)}
                </ReadOnlyField>
                <ReadOnlyField label="Notes" htmlFor="submission-notes-ro">
                  {submission.review_notes || "—"}
                </ReadOnlyField>
              </>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </FieldGroup>
        </div>
      </SheetContent>
    </Sheet>
  );
}
