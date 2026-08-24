"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Pencil } from "lucide-react";
import { deleteRoleAction, renameRoleAction } from "./actions";
import { isSeededRole } from "./seeded-roles";
import { formatRoleLabel } from "@/lib/format";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

export type RoleRow = { id: string; name: string; description: string | null };

type FormState = { name: string; description: string };

function formStateFor(role: RoleRow): FormState {
  return { name: role.name, description: role.description ?? "" };
}

function isDirty(form: FormState, role: RoleRow) {
  const baseline = formStateFor(role);
  return (
    form.name !== baseline.name || form.description !== baseline.description
  );
}

export function RoleDetailsDialog({ role }: { role: RoleRow }) {
  const router = useRouter();
  const protectedRole = isSeededRole(role.name);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<FormState>(() => formStateFor(role));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [discardTarget, setDiscardTarget] = useState<"toggle" | "close" | null>(
    null,
  );
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const formId = `edit-role-form-${role.id}`;
  const dirty = isDirty(form, role);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && mode === "edit" && dirty) {
      setDiscardTarget("close");
      return;
    }
    setOpen(nextOpen);
    if (nextOpen) {
      setForm(formStateFor(role));
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
    setForm(formStateFor(role));
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
      const result = await renameRoleAction(
        role.id,
        form.name,
        form.description,
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("view");
      router.refresh();
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteRoleAction(role.id);
      if ("error" in result) {
        setDeleteConfirmOpen(false);
        setError(result.error);
        return;
      }
      setDeleteConfirmOpen(false);
      setOpen(false);
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
              aria-label={`View ${role.name}`}
            />
          }
        >
          <Eye />
        </SheetTrigger>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="data-[side=right]:sm:max-w-lg"
        >
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
              <SheetTitle>{mode === "edit" ? "Edit role" : "Role"}</SheetTitle>
              <SheetDescription>
                {mode === "edit"
                  ? "Update this role's details."
                  : "View this role's details."}
              </SheetDescription>
            </div>
            {mode === "view" ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Edit role"
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
                <ReadOnlyField label="Role name" htmlFor="role-name">
                  {formatRoleLabel(role.name)}
                </ReadOnlyField>
                <ReadOnlyField label="Description" htmlFor="role-description">
                  {role.description || "—"}
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
                  <Field>
                    <FieldLabel htmlFor="role-edit-name">Role name</FieldLabel>
                    <Input
                      id="role-edit-name"
                      required
                      value={form.name}
                      onChange={(event) => update("name", event.target.value)}
                      disabled={protectedRole}
                      title={
                        protectedRole
                          ? "Built-in roles can't be renamed."
                          : undefined
                      }
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="role-edit-description">
                      Description
                    </FieldLabel>
                    <Textarea
                      id="role-edit-description"
                      value={form.description}
                      onChange={(event) =>
                        update("description", event.target.value)
                      }
                    />
                  </Field>

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
            <SheetFooter className="flex-row items-center justify-between border-t bg-muted/50">
              <Button
                type="button"
                variant="destructive"
                disabled={protectedRole || isPending}
                title={
                  protectedRole ? "Built-in roles can't be deleted." : undefined
                }
                onClick={() => setDeleteConfirmOpen(true)}
              >
                Delete role
              </Button>
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
              You have unsaved changes to this role. Leaving now will discard
              them.
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

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this role?</AlertDialogTitle>
            <AlertDialogDescription>
              This can&apos;t be undone. The role must not be assigned to any
              users.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? "Deleting..." : "Delete role"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
