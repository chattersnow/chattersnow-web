"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Pencil } from "lucide-react";
import { updateRoleTypeAction } from "./actions";
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
import { Checkbox } from "@/components/ui/checkbox";
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

export type RoleTypeRow = {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
};

type FormState = { name: string; description: string; isPublic: boolean };

function formStateFor(roleType: RoleTypeRow): FormState {
  return {
    name: roleType.name,
    description: roleType.description ?? "",
    isPublic: roleType.is_public,
  };
}

function isDirty(form: FormState, roleType: RoleTypeRow) {
  const baseline = formStateFor(roleType);
  return (
    form.name !== baseline.name ||
    form.description !== baseline.description ||
    form.isPublic !== baseline.isPublic
  );
}

export function RoleTypeDetailsSheet({
  roleType,
  canManage,
}: {
  roleType: RoleTypeRow;
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<FormState>(() => formStateFor(roleType));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [discardTarget, setDiscardTarget] = useState<"toggle" | "close" | null>(
    null,
  );
  const formId = `edit-role-type-form-${roleType.id}`;
  const dirty = isDirty(form, roleType);

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
      setForm(formStateFor(roleType));
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
    setForm(formStateFor(roleType));
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

    const formData = new FormData();
    formData.set("name", form.name);
    formData.set("description", form.description);
    formData.set("isPublic", form.isPublic ? "on" : "off");

    startTransition(async () => {
      const result = await updateRoleTypeAction(roleType.id, formData);
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
              aria-label={`View ${roleType.name}`}
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
              <SheetTitle>
                {mode === "edit" ? "Edit role type" : "Role type"}
              </SheetTitle>
              <SheetDescription>
                {mode === "edit"
                  ? "Update this role type's details."
                  : "View this role type's details."}
              </SheetDescription>
            </div>
            {canManage &&
              (mode === "view" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Edit role type"
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
              ))}
          </SheetHeader>

          {mode === "view" ? (
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <FieldGroup>
                <ReadOnlyField label="Role name" htmlFor="role-type-name">
                  {roleType.name}
                </ReadOnlyField>
                <ReadOnlyField
                  label="Description"
                  htmlFor="role-type-description"
                >
                  {roleType.description || "—"}
                </ReadOnlyField>
                <ReadOnlyField label="Public" htmlFor="role-type-is-public">
                  {roleType.is_public ? "Yes" : "No"}
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
                    <FieldLabel htmlFor="role-type-edit-name">
                      Role name
                    </FieldLabel>
                    <Input
                      id="role-type-edit-name"
                      required
                      value={form.name}
                      onChange={(event) => update("name", event.target.value)}
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="role-type-edit-description">
                      Description
                    </FieldLabel>
                    <Textarea
                      id="role-type-edit-description"
                      value={form.description}
                      onChange={(event) =>
                        update("description", event.target.value)
                      }
                    />
                  </Field>

                  <Field orientation="horizontal">
                    <Checkbox
                      id="role-type-edit-isPublic"
                      checked={form.isPublic}
                      onCheckedChange={(checked) =>
                        update("isPublic", Boolean(checked))
                      }
                    />
                    <FieldLabel htmlFor="role-type-edit-isPublic">
                      Show on public site
                    </FieldLabel>
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
              You have unsaved changes to this role type. Leaving now will
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
