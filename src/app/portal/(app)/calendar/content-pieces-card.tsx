"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import {
  createContentPieceAction,
  deleteContentPieceAction,
  updateContentPieceAction,
} from "./content-opportunity-actions";
import {
  CONTENT_STATUSES,
  leadTimeSchedule,
  nextDueAt,
  type ContentPieceRow,
} from "./content-opportunity-shared";
import { ContentStatusBadge } from "./content-opportunity-badges";
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
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { calendarActorName, ownerName, ownerOptions } from "./calendar-shared";
import type { CalendarOwner } from "./calendar-shared";
import { PersonSelect } from "../people/person-select";
import { Spinner } from "@/components/ui/spinner";
import { formatDateTime } from "@/lib/format";
import { utcIsoToDatetimeLocalInBrowser } from "@/lib/time";
import { EmptyState } from "@/components/portal/empty-state";
import { runAction } from "@/components/portal/action-toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";

const INTERNAL_NOTES_POLICY =
  "Staff-only working notes. Never record specific personal, medical, legal, or confidential case details here.";

function formStateFor(
  piece: ContentPieceRow | null,
  defaultLeadTimeDays: number,
  itemStartsAt: string,
) {
  return {
    title: piece?.title ?? "",
    content: piece?.content ?? "",
    contentStatus: piece?.content_status ?? "not_planned",
    skipReason: piece?.skip_reason ?? "",
    internalNotes: piece?.internal_notes ?? "",
    ownerId: piece?.owner_id ?? "",
    reviewerId: piece?.reviewer_id ?? "",
    leadTimeDays: String(piece?.lead_time_days ?? defaultLeadTimeDays),
    publishDueAt: utcIsoToDatetimeLocalInBrowser(
      piece?.publish_due_at ?? itemStartsAt,
    ),
    reviewDueAt: utcIsoToDatetimeLocalInBrowser(piece?.review_due_at ?? null),
    draftDueAt: utcIsoToDatetimeLocalInBrowser(piece?.draft_due_at ?? null),
  };
}

type FormState = ReturnType<typeof formStateFor>;

/**
 * The content planned for one calendar item (#1231).
 *
 * A calendar item produces several posts or stories, not one brief, so this is
 * a list of pieces with a sheet behind each one rather than a single form of
 * labelled boxes. Everything the retired prose fields asked for -- the angle,
 * the channels, the call to action, what is still outstanding -- goes in the
 * one `content` textarea, in whatever order the person planning it thinks in.
 */
export function ContentPiecesCard({
  calendarItemId,
  itemStartsAt,
  pieces,
  owners,
  defaultLeadTimeDays,
  canManage,
  isSensitiveTopic,
  toneGuidance,
  className,
}: {
  calendarItemId: string;
  itemStartsAt: string;
  pieces: ContentPieceRow[];
  owners: CalendarOwner[];
  defaultLeadTimeDays: number;
  canManage: boolean;
  isSensitiveTopic: boolean;
  toneGuidance: string | null;
  className?: string;
}) {
  const router = useRouter();
  // `null` means the sheet is closed. An open sheet carries the piece it is
  // showing, or `null` for the one being added.
  const [open, setOpen] = useState<{ piece: ContentPieceRow | null } | null>(
    null,
  );
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<FormState>(() =>
    formStateFor(null, defaultLeadTimeDays, itemStartsAt),
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  const piece = open?.piece ?? null;
  const formId = "content-piece-form";

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openSheet(next: ContentPieceRow | null, nextMode: "view" | "edit") {
    setForm(formStateFor(next, defaultLeadTimeDays, itemStartsAt));
    setError(null);
    setMode(nextMode);
    setOpen({ piece: next });
  }

  function closeSheet() {
    setOpen(null);
    setError(null);
  }

  function applyLeadTimeDefaults() {
    if (!form.publishDueAt) {
      setError("Set a publish due date before applying lead-time defaults.");
      return;
    }
    const leadTimeDays = Number(form.leadTimeDays);
    if (!Number.isInteger(leadTimeDays) || leadTimeDays <= 0) {
      setError("Set a valid lead time before applying defaults.");
      return;
    }
    const { draftDueAt, reviewDueAt } = leadTimeSchedule(
      new Date(form.publishDueAt),
      leadTimeDays,
    );
    setError(null);
    setForm((prev) => ({
      ...prev,
      draftDueAt: utcIsoToDatetimeLocalInBrowser(draftDueAt.toISOString()),
      reviewDueAt: utcIsoToDatetimeLocalInBrowser(reviewDueAt.toISOString()),
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("title", form.title);
    formData.set("content", form.content);
    formData.set("contentStatus", form.contentStatus);
    formData.set("skipReason", form.skipReason);
    formData.set("internalNotes", form.internalNotes);
    formData.set("ownerId", form.ownerId);
    formData.set("reviewerId", form.reviewerId);
    formData.set("leadTimeDays", form.leadTimeDays);
    // Converted here, in the browser, so each due instant is fixed using the
    // user's own timezone rather than the server's.
    formData.set(
      "publishDueAt",
      form.publishDueAt ? new Date(form.publishDueAt).toISOString() : "",
    );
    formData.set(
      "reviewDueAt",
      form.reviewDueAt ? new Date(form.reviewDueAt).toISOString() : "",
    );
    formData.set(
      "draftDueAt",
      form.draftDueAt ? new Date(form.draftDueAt).toISOString() : "",
    );

    startTransition(async () => {
      await runAction(
        () =>
          piece
            ? updateContentPieceAction(piece.id, formData)
            : createContentPieceAction(calendarItemId, formData),
        {
          success: piece ? "Content piece saved." : "Content piece added.",
          onError: setError,
          onSuccess: () => {
            closeSheet();
            router.refresh();
          },
        },
      );
    });
  }

  function handleDelete() {
    if (!piece) return;
    startTransition(async () => {
      await runAction(() => deleteContentPieceAction(piece.id), {
        success: "Content piece deleted.",
        onError: (message) => {
          setConfirmDelete(false);
          setError(message);
        },
        onSuccess: () => {
          setConfirmDelete(false);
          closeSheet();
          router.refresh();
        },
      });
    });
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="app-muted text-sm font-semibold">
          Content
        </CardTitle>
        {canManage && pieces.length > 0 && (
          <CardAction>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => openSheet(null, "edit")}
            >
              <Plus /> Add content
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isSensitiveTopic && (
          <Alert>
            <AlertDescription>
              <strong>Sensitive topic.</strong>{" "}
              {toneGuidance ??
                "Add tone guidance on this item's Details tab so it's surfaced here for whoever writes this content."}
            </AlertDescription>
          </Alert>
        )}

        {error && !open && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {pieces.length === 0 ? (
          <EmptyState
            className="py-4"
            title="No content planned for this item yet"
            description={
              canManage
                ? "Add a piece for each post or story this moment should produce."
                : "Pieces appear here once a content manager plans them."
            }
            action={
              canManage ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => openSheet(null, "edit")}
                >
                  <Plus /> Add content
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {pieces.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="truncate font-medium" title={row.title}>
                    {row.title}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <ContentStatusBadge status={row.content_status} />
                    <span className="app-muted text-xs">
                      {ownerName(owners, row.owner_id, "No owner")}
                    </span>
                    <span className="app-muted text-xs">
                      {nextDueAt(row)
                        ? `Due ${formatDateTime(nextDueAt(row))}`
                        : "No dates set"}
                    </span>
                  </div>
                </div>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`View ${row.title}`}
                        onClick={() => openSheet(row, "view")}
                      />
                    }
                  >
                    <Pencil />
                  </TooltipTrigger>
                  <TooltipContent>View content piece</TooltipContent>
                </Tooltip>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Sheet
        open={open !== null}
        onOpenChange={(next) => !next && closeSheet()}
      >
        <SheetContent side="right" showCloseButton={false}>
          <SheetHeader className="flex-row items-start gap-2 space-y-0">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Close"
                    onClick={closeSheet}
                  />
                }
              >
                <ArrowLeft />
              </TooltipTrigger>
              <TooltipContent>Close</TooltipContent>
            </Tooltip>
            <div className="flex flex-1 flex-col gap-0.5">
              <SheetTitle>
                {piece
                  ? mode === "edit"
                    ? "Edit content piece"
                    : "Content piece"
                  : "Add content"}
              </SheetTitle>
              <SheetDescription>
                {piece?.title ?? "One post or story for this calendar item."}
              </SheetDescription>
            </div>
            {piece && mode === "view" && canManage && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Edit content piece"
                      onClick={() => setMode("edit")}
                    />
                  }
                >
                  <Pencil />
                </TooltipTrigger>
                <TooltipContent>Edit</TooltipContent>
              </Tooltip>
            )}
          </SheetHeader>

          {mode === "view" && piece ? (
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <FieldGroup>
                <ContentStatusBadge status={piece.content_status} />
                {piece.content_status === "skipped" && piece.skip_reason && (
                  <ReadOnlyField
                    label="Skip reason"
                    htmlFor="piece-view-skip-reason"
                  >
                    {piece.skip_reason}
                  </ReadOnlyField>
                )}
                <Field orientation="responsive">
                  <ReadOnlyField label="Owner" htmlFor="piece-view-owner">
                    {ownerName(owners, piece.owner_id)}
                  </ReadOnlyField>
                  <ReadOnlyField label="Reviewer" htmlFor="piece-view-reviewer">
                    {ownerName(owners, piece.reviewer_id)}
                  </ReadOnlyField>
                </Field>
                <ReadOnlyField label="Lead time" htmlFor="piece-view-lead-time">
                  {piece.lead_time_days} days
                </ReadOnlyField>
                <Field orientation="responsive">
                  <ReadOnlyField label="Draft due" htmlFor="piece-view-draft">
                    {formatDateTime(piece.draft_due_at)}
                  </ReadOnlyField>
                  <ReadOnlyField label="Review due" htmlFor="piece-view-review">
                    {formatDateTime(piece.review_due_at)}
                  </ReadOnlyField>
                  <ReadOnlyField
                    label="Publish due"
                    htmlFor="piece-view-publish"
                  >
                    {formatDateTime(piece.publish_due_at)}
                  </ReadOnlyField>
                </Field>
                <Field>
                  <ReadOnlyField
                    label="Internal notes"
                    htmlFor="piece-view-internal-notes"
                  >
                    {piece.internal_notes || "—"}
                  </ReadOnlyField>
                  <FieldDescription>{INTERNAL_NOTES_POLICY}</FieldDescription>
                </Field>
                <ReadOnlyField label="Content" htmlFor="piece-view-content">
                  <span className="whitespace-pre-wrap">
                    {piece.content || "—"}
                  </span>
                </ReadOnlyField>
                {piece.status_changed_at && (
                  <p className="app-muted text-xs">
                    Status last changed{" "}
                    {formatDateTime(piece.status_changed_at)} by{" "}
                    {calendarActorName(
                      owners,
                      piece.status_changed_by,
                      "someone no longer listed",
                    )}
                  </p>
                )}
              </FieldGroup>
            </div>
          ) : (
            <form
              id={formId}
              onSubmit={handleSubmit}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                <FieldGroup>
                  <RequiredFieldsNote />
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <Field>
                    <FieldLabel htmlFor="piece-title" required>
                      Title
                    </FieldLabel>
                    <Input
                      id="piece-title"
                      required
                      placeholder="e.g. Instagram carousel: how the gear swap works"
                      value={form.title}
                      onChange={(event) => update("title", event.target.value)}
                    />
                  </Field>

                  <Field orientation="responsive">
                    <Field>
                      <FieldLabel htmlFor="piece-contentStatus">
                        Status
                      </FieldLabel>
                      <Select
                        value={form.contentStatus}
                        onValueChange={(value) =>
                          update("contentStatus", value ?? "not_planned")
                        }
                      >
                        <SelectTrigger
                          id="piece-contentStatus"
                          className="w-full"
                        >
                          <SelectValue placeholder="Select status">
                            {(value: string) =>
                              CONTENT_STATUSES.find(
                                (option) => option.value === value,
                              )?.label
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {CONTENT_STATUSES.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="piece-skipReason">
                        Skip reason
                      </FieldLabel>
                      <Input
                        id="piece-skipReason"
                        placeholder={
                          form.contentStatus === "skipped"
                            ? "Reason (required)"
                            : "Only used when skipped"
                        }
                        value={form.skipReason}
                        onChange={(event) =>
                          update("skipReason", event.target.value)
                        }
                      />
                    </Field>
                  </Field>

                  <Field orientation="responsive">
                    <Field>
                      <FieldLabel htmlFor="piece-ownerId">Owner</FieldLabel>
                      <PersonSelect
                        id="piece-ownerId"
                        people={ownerOptions(owners)}
                        value={form.ownerId || null}
                        onChange={(personId) =>
                          update("ownerId", personId ?? "")
                        }
                        noneLabel="No owner"
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="piece-reviewerId">
                        Reviewer
                      </FieldLabel>
                      <PersonSelect
                        id="piece-reviewerId"
                        people={ownerOptions(owners)}
                        value={form.reviewerId || null}
                        onChange={(personId) =>
                          update("reviewerId", personId ?? "")
                        }
                        noneLabel="No reviewer"
                      />
                    </Field>
                  </Field>

                  <Field orientation="responsive">
                    <Field>
                      <FieldLabel htmlFor="piece-leadTimeDays">
                        Lead time (days)
                      </FieldLabel>
                      <Input
                        id="piece-leadTimeDays"
                        type="number"
                        min={1}
                        step={1}
                        value={form.leadTimeDays}
                        onChange={(event) =>
                          update("leadTimeDays", event.target.value)
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="piece-publishDueAt">
                        Publish due
                      </FieldLabel>
                      <Input
                        id="piece-publishDueAt"
                        type="datetime-local"
                        value={form.publishDueAt}
                        onChange={(event) =>
                          update("publishDueAt", event.target.value)
                        }
                      />
                    </Field>
                  </Field>

                  <div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={applyLeadTimeDefaults}
                    >
                      Apply lead-time defaults
                    </Button>
                  </div>

                  <Field orientation="responsive">
                    <Field>
                      <FieldLabel htmlFor="piece-reviewDueAt">
                        Review due
                      </FieldLabel>
                      <Input
                        id="piece-reviewDueAt"
                        type="datetime-local"
                        value={form.reviewDueAt}
                        onChange={(event) =>
                          update("reviewDueAt", event.target.value)
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="piece-draftDueAt">
                        Draft due
                      </FieldLabel>
                      <Input
                        id="piece-draftDueAt"
                        type="datetime-local"
                        value={form.draftDueAt}
                        onChange={(event) =>
                          update("draftDueAt", event.target.value)
                        }
                      />
                    </Field>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="piece-internalNotes">
                      Internal notes
                    </FieldLabel>
                    <Textarea
                      id="piece-internalNotes"
                      value={form.internalNotes}
                      onChange={(event) =>
                        update("internalNotes", event.target.value)
                      }
                    />
                    <FieldDescription>{INTERNAL_NOTES_POLICY}</FieldDescription>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="piece-content">Content</FieldLabel>
                    <Textarea
                      id="piece-content"
                      className="min-h-64"
                      placeholder="The angle, the channels, the call to action, what's still outstanding — whatever order you think in."
                      value={form.content}
                      onChange={(event) =>
                        update("content", event.target.value)
                      }
                    />
                  </Field>
                </FieldGroup>
              </div>
            </form>
          )}

          {mode === "edit" && (
            <SheetFooter className="items-center justify-between">
              {piece ? (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isPending}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isPending}
                  onClick={closeSheet}
                >
                  Cancel
                </Button>
              )}
              <Button type="submit" form={formId} disabled={isPending}>
                {isPending ? (
                  <>
                    <Spinner /> Saving...
                  </>
                ) : piece ? (
                  "Save changes"
                ) : (
                  "Add content"
                )}
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={confirmDelete}
        onOpenChange={(next) => !next && setConfirmDelete(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &ldquo;{piece?.title}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes this content piece and everything written
              on it. The calendar item and its other pieces are untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={handleDelete}
            >
              {isPending ? (
                <>
                  <Spinner /> Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
