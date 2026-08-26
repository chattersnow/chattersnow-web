"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Pencil } from "lucide-react";
import { updateBoardMemberAction } from "./actions";
import {
  BoardMemberFormFields,
  packBoardMemberFormData,
  type BoardMemberFormState,
} from "./board-member-form-fields";
import type { BoardMemberRow } from "./board-members-shared";
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
import { FieldGroup } from "@/components/ui/field";
import { ReadOnlyField } from "@/components/ui/read-only-field";
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

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function formatDate(value: string | null) {
  if (!value) return "—";
  return dateFormatter.format(new Date(value));
}

function formStateFor(boardMember: BoardMemberRow): BoardMemberFormState {
  return {
    roleTitle: boardMember.role_title,
    termStart: boardMember.term_start,
    termEnd: boardMember.term_end ?? "",
    isActive: boardMember.is_active,
    notes: boardMember.notes ?? "",
  };
}

function isDirty(form: BoardMemberFormState, boardMember: BoardMemberRow) {
  const baseline = formStateFor(boardMember);
  return (
    form.roleTitle !== baseline.roleTitle ||
    form.termStart !== baseline.termStart ||
    form.termEnd !== baseline.termEnd ||
    form.isActive !== baseline.isActive ||
    form.notes !== baseline.notes
  );
}

export function EditBoardMemberModal({
  boardMember,
}: {
  boardMember: BoardMemberRow;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<BoardMemberFormState>(() =>
    formStateFor(boardMember),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [discardTarget, setDiscardTarget] = useState<"toggle" | "close" | null>(
    null,
  );
  const formId = `edit-board-member-form-${boardMember.id}`;
  const dirty = isDirty(form, boardMember);

  function update<K extends keyof BoardMemberFormState>(
    key: K,
    value: BoardMemberFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && mode === "edit" && dirty) {
      setDiscardTarget("close");
      return;
    }
    setOpen(nextOpen);
    if (nextOpen) {
      setForm(formStateFor(boardMember));
      setError(null);
      setMode("view");
    }
  }

  function requestExitEditMode() {
    if (dirty) {
      setDiscardTarget("toggle");
      return;
    }
    setMode("view");
  }

  function confirmDiscard() {
    setForm(formStateFor(boardMember));
    setError(null);
    setMode("view");
    if (discardTarget === "close") {
      setOpen(false);
    }
    setDiscardTarget(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await updateBoardMemberAction(
        boardMember.id,
        packBoardMemberFormData(form),
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("view");
      router.refresh();
    });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="View board member"
            />
          }
        >
          <Eye />
        </SheetTrigger>
        <SheetContent side="right" showCloseButton={false}>
          <SheetHeader className="flex-row items-start gap-2 space-y-0">
            <SheetClose
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close"
                />
              }
            >
              <ArrowLeft />
            </SheetClose>
            <div className="flex flex-1 flex-col gap-0.5">
              <SheetTitle>
                {mode === "edit" ? "Edit board member" : "Board member"}
              </SheetTitle>
              <SheetDescription>
                {mode === "edit"
                  ? "Update this board member's term details."
                  : "View this board member's term details."}
              </SheetDescription>
            </div>
            {mode === "view" ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Edit board member"
                onClick={() => setMode("edit")}
              >
                <Pencil />
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={requestExitEditMode}
              >
                View
              </Button>
            )}
          </SheetHeader>

          {mode === "view" ? (
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <FieldGroup>
                <ReadOnlyField
                  label="Person"
                  htmlFor="edit-board-member-person"
                >
                  {boardMember.person.name || "—"}
                </ReadOnlyField>
                <ReadOnlyField
                  label="Role / title"
                  htmlFor="edit-board-member-role-title"
                >
                  {boardMember.role_title || "—"}
                </ReadOnlyField>
                <ReadOnlyField
                  label="Term start"
                  htmlFor="edit-board-member-term-start"
                >
                  {formatDate(boardMember.term_start)}
                </ReadOnlyField>
                <ReadOnlyField
                  label="Term end"
                  htmlFor="edit-board-member-term-end"
                >
                  {formatDate(boardMember.term_end)}
                </ReadOnlyField>
                <ReadOnlyField
                  label="Active"
                  htmlFor="edit-board-member-active"
                >
                  {boardMember.is_active ? "Yes" : "No"}
                </ReadOnlyField>
                <ReadOnlyField label="Notes" htmlFor="edit-board-member-notes">
                  {boardMember.notes || "—"}
                </ReadOnlyField>
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
                  <ReadOnlyField
                    label="Person"
                    htmlFor="edit-board-member-person-locked"
                  >
                    {boardMember.person.name || "—"}
                  </ReadOnlyField>

                  <BoardMemberFormFields
                    form={form}
                    update={update}
                    idPrefix="edit-board-member"
                  />

                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                </FieldGroup>
              </div>
            </form>
          )}

          {mode === "edit" && (
            <SheetFooter className="flex-row justify-end border-t bg-muted/50">
              <Button type="submit" form={formId} disabled={isPending}>
                {isPending ? "Saving..." : "Save changes"}
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={discardTarget !== null}
        onOpenChange={(next) => !next && setDiscardTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to this board member. Leaving now will
              discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDiscardTarget(null)}>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
