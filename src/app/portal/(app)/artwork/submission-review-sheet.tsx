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
  SheetFooter,
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
import {
  DiscardChangesDialog,
  useUnsavedChangesGuard,
} from "@/components/portal/unsaved-changes-guard";
import { RecordMessages } from "@/components/portal/record-messages";
import {
  messagingDisabledReason,
  type MessageActor,
  type RecordMessageRow,
} from "@/lib/outbound-messages";
import { ArtworkSubmissionMessageActions } from "./submission-message-actions";

const STATUS_ITEMS = ARTWORK_SUBMISSION_STATUSES.map((status) => ({
  value: status,
  label: humanizeStatus(status),
}));

export function ArtworkSubmissionReviewSheet({
  submission,
  images,
  canManage,
  messages,
  messageActors,
  orgName,
  replyTo,
  orgEmailEnabled,
  defaultOpen = false,
  withTrigger = true,
}: {
  submission: ArtworkSubmission;
  images: SignedArtworkImage[];
  canManage: boolean;
  /** This submission's slice of the page's history, loaded in one query. */
  messages: RecordMessageRow[];
  messageActors: MessageActor[];
  /** The organization's own name, for the composer's default subject. */
  orgName: string;
  /** The tenant's Reply-To, or null when only the platform default applies. */
  replyTo: string | null;
  orgEmailEnabled: boolean;
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
  // What the server holds, so "dirty" is a comparison rather than a flag that
  // has to be cleared in three places. The status picker saves on change, and
  // it sends the notes with it, so a successful save of either realigns this.
  const [savedNotes, setSavedNotes] = useState(submission.review_notes ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const label = submission.title || `Untitled, ${submission.submitter_name}`;
  // Only the notes can be unsaved: the status picker commits on change.
  const guard = useUnsavedChangesGuard(canManage && notes !== savedNotes);

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
      setSavedNotes(notes);
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

  /** Puts the typed notes back and closes, once the reader has said to. */
  function discard() {
    setNotes(savedNotes);
    onOpenChange(false);
  }

  return (
    <>
      <Sheet
        open={open}
        // Escape, the backdrop and the header's own close all arrive here, so
        // this one line covers every way out of the sheet (#1095).
        onOpenChange={(next) => {
          if (guard.allowOpenChange(next)) onOpenChange(next);
        }}
      >
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
              {/*
              Only rendered when the artist asked to be credited differently.
              submit_artwork() stores credit_name only when it differs from the
              contact name, so the presence of this row is the signal -- a
              reviewer should not have to compare two strings to notice that
              the printed name is not the one above.
            */}
              {submission.credit_name && (
                <ReadOnlyField label="Credit as" htmlFor="submission-credit">
                  {submission.credit_name}
                </ReadOnlyField>
              )}
              {submission.portfolio_url && (
                <ReadOnlyField label="Portfolio" htmlFor="submission-portfolio">
                  <PortfolioValue value={submission.portfolio_url} />
                </ReadOnlyField>
              )}
              {/* The call, not the event: a submission always belongs to one
                call and since #879 may belong to no event at all. The event
                stays alongside it as context when there is one. */}
              <ReadOnlyField label="For" htmlFor="submission-call">
                {submission.call?.title || "—"}
                {submission.event?.name ? ` · ${submission.event.name}` : ""}
              </ReadOnlyField>
              <ReadOnlyField label="Medium" htmlFor="submission-medium">
                {submission.medium || "—"}
              </ReadOnlyField>
              <ReadOnlyField label="About the work" htmlFor="submission-about">
                {submission.artist_statement || "—"}
              </ReadOnlyField>
              <ReadOnlyField label="Consent" htmlFor="submission-consent">
                {submission.consented_at
                  ? `Confirmed the work is theirs on ${formatDateTime(submission.consented_at)}`
                  : // Only submissions taken before #877 shipped. Worth saying
                    // plainly rather than showing an em dash, because "we never
                    // asked" and "they declined" are not the same thing and a
                    // reviewer reprinting the piece should know which it is.
                    "Not recorded — submitted before consent was collected"}
                {/*
                  The wording as it stood that day (#1319), not the call's
                  current note -- the curator may have rewritten it since, and
                  the point of the snapshot is that this reviewer sees what this
                  artist agreed to without going to read the call. Absent means
                  the call stated no rights or credit terms, which is why there
                  is no placeholder: there is nothing to show, and inventing one
                  would read as terms.
                */}
                {submission.consented_terms && (
                  <blockquote className="mt-2 border-l-2 border-border pl-3 whitespace-pre-line text-muted-foreground">
                    {submission.consented_terms}
                  </blockquote>
                )}
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

            {/* In the scrolling body rather than the footer, which belongs to
              Save and Delete: this is a record of what happened, not a
              decision about the piece. */}
            {canManage && (
              <section className="mt-6 flex flex-col gap-3">
                <h3 className="app-muted text-sm font-semibold">Messages</h3>
                <ArtworkSubmissionMessageActions
                  submissionId={submission.id}
                  artistName={submission.submitter_name}
                  toEmail={submission.submitter_email}
                  callTitle={submission.call?.title ?? ""}
                  orgName={orgName}
                  replyTo={replyTo}
                  disabledReason={messagingDisabledReason(
                    orgEmailEnabled,
                    submission.submitter_email,
                    "This submission has no email address to write to.",
                  )}
                />
                <RecordMessages
                  messages={messages}
                  actors={messageActors}
                  emptyMessage="Nothing has been sent to this artist from the portal. The acknowledgement they received when they submitted is not listed here — it was sent by the application itself."
                />
              </section>
            )}
          </div>

          {/* Out of the scrolling body and pinned to the bottom edge, which is
            where all 27 of the portal's other edit sheets put their primary
            action. Inside it, Save sat under the notes field and went below
            the fold on any submission with a long statement or several
            previews, moving as the reader scrolled (#1095). A holder who
            cannot manage has nothing to save, and gets no empty bar. */}
          {canManage && (
            <SheetFooter className="justify-between">
              <Button
                type="button"
                variant="destructive"
                disabled={isPending}
                onClick={() => setConfirmingDelete(true)}
              >
                Delete submission
              </Button>
              <Button
                type="button"
                disabled={isPending}
                onClick={() => save(status)}
              >
                {isPending ? (
                  <>
                    <Spinner /> Saving...
                  </>
                ) : (
                  "Save notes"
                )}
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      <DiscardChangesDialog
        guard={guard}
        subject="these review notes"
        onDiscard={discard}
      />

      {/* The portal has no undo, and this destroys the artist's files along
          with the row. Named, and stated, the way every other destructive
          confirmation in the portal is. */}
      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the submission and its uploaded images for good. It
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={handleDelete}
            >
              Delete submission
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * A portfolio value as a link only when it is safely one.
 *
 * The field accepts an @handle as readily as a URL, and the column's check
 * constraint only guarantees that anything carrying a scheme carries http or
 * https. So the scheme is re-tested here before an anchor is rendered: a
 * reviewer clicking through from the portal must never be handed a
 * `javascript:` or `data:` target, and anything that is not plainly a web
 * address is shown as the text the artist typed.
 */
function PortfolioValue({ value }: { value: string }) {
  if (!/^https?:\/\//i.test(value)) return <>{value}</>;
  return (
    <a
      href={value}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="underline underline-offset-4"
    >
      {value}
    </a>
  );
}
