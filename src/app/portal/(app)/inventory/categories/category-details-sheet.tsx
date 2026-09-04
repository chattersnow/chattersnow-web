"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Pencil } from "lucide-react";
import {
  deleteInventoryCategoryAction,
  updateInventoryCategoryAction,
} from "./actions";
import type { CategoryGroupOption } from "./new-category-dialog";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

export type CategoryRow = {
  id: string;
  key: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  group_id: string;
  group_label: string;
  item_count: number;
};

type FormState = {
  groupId: string;
  label: string;
  sortOrder: string;
  isActive: boolean;
};

function formStateFor(category: CategoryRow): FormState {
  return {
    groupId: category.group_id,
    label: category.label,
    sortOrder: String(category.sort_order),
    isActive: category.is_active,
  };
}

function isDirty(form: FormState, category: CategoryRow) {
  const baseline = formStateFor(category);
  return (Object.keys(baseline) as (keyof FormState)[]).some(
    (key) => form[key] !== baseline[key],
  );
}

export function CategoryDetailsSheet({
  category,
  groups,
  canManage,
}: {
  category: CategoryRow;
  groups: CategoryGroupOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<FormState>(() => formStateFor(category));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [discardTarget, setDiscardTarget] = useState<"toggle" | "close" | null>(
    null,
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const formId = `edit-category-form-${category.id}`;
  const dirty = isDirty(form, category);

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
      setForm(formStateFor(category));
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
    setForm(formStateFor(category));
    setError(null);
    setMode("view");
    if (discardTarget === "close") setOpen(false);
    setDiscardTarget(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("groupId", form.groupId);
    formData.set("label", form.label);
    formData.set("sortOrder", form.sortOrder);
    formData.set("isActive", form.isActive ? "on" : "off");

    startTransition(async () => {
      const result = await updateInventoryCategoryAction(category.id, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("view");
      toast.success("Category saved.");
      router.refresh();
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteInventoryCategoryAction(category.id);
      setConfirmingDelete(false);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      toast.success("Category deleted.");
      router.refresh();
    });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <Tooltip>
          <SheetTrigger
            render={
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`View ${category.label}`}
                  />
                }
              />
            }
          >
            <Eye />
          </SheetTrigger>
          <TooltipContent>{`View ${category.label}`}</TooltipContent>
        </Tooltip>
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
              <SheetTitle>
                {mode === "edit" ? "Edit category" : "Item category"}
              </SheetTitle>
              <SheetDescription>
                {mode === "edit"
                  ? "Rename it, move it to another group, or retire it."
                  : "View this category's details."}
              </SheetDescription>
            </div>
            {canManage &&
              (mode === "view" ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Edit category"
                        onClick={() => setMode("edit")}
                      />
                    }
                  >
                    <Pencil />
                  </TooltipTrigger>
                  <TooltipContent>Edit category</TooltipContent>
                </Tooltip>
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
                <ReadOnlyField label="Group" htmlFor="category-group-view">
                  {category.group_label}
                </ReadOnlyField>
                <ReadOnlyField label="Category" htmlFor="category-label-view">
                  {category.label}
                </ReadOnlyField>
                <ReadOnlyField label="Key" htmlFor="category-key-view">
                  {category.key}
                </ReadOnlyField>
                <ReadOnlyField label="Sort order" htmlFor="category-sort-view">
                  {category.sort_order}
                </ReadOnlyField>
                <ReadOnlyField label="Active" htmlFor="category-active-view">
                  {category.is_active ? "Yes" : "No"}
                </ReadOnlyField>
                <ReadOnlyField label="Items" htmlFor="category-items-view">
                  {category.item_count}
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
                    <FieldLabel htmlFor="category-edit-group">Group</FieldLabel>
                    <Select
                      value={form.groupId || null}
                      onValueChange={(value) =>
                        update("groupId", (value as string) ?? "")
                      }
                    >
                      <SelectTrigger
                        id="category-edit-group"
                        className="w-full"
                      >
                        <SelectValue placeholder="Select a group" />
                      </SelectTrigger>
                      <SelectContent>
                        {groups.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            {group.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="category-edit-label">
                      Category name
                    </FieldLabel>
                    <Input
                      id="category-edit-label"
                      required
                      value={form.label}
                      onChange={(event) => update("label", event.target.value)}
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="category-edit-sort">
                      Sort order
                    </FieldLabel>
                    <Input
                      id="category-edit-sort"
                      type="number"
                      min={0}
                      value={form.sortOrder}
                      onChange={(event) =>
                        update("sortOrder", event.target.value)
                      }
                    />
                  </Field>

                  <Field orientation="horizontal">
                    <Checkbox
                      id="category-edit-active"
                      checked={form.isActive}
                      onCheckedChange={(checked) =>
                        update("isActive", Boolean(checked))
                      }
                    />
                    <FieldLabel htmlFor="category-edit-active">
                      Active — offered when tagging an item
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
            <SheetFooter className="flex-row justify-between border-t bg-muted/50">
              <Button
                type="button"
                variant="destructive"
                disabled={isPending}
                onClick={() => setConfirmingDelete(true)}
              >
                Delete
              </Button>
              <Button type="submit" form={formId} disabled={isPending}>
                {isPending ? (
                  <>
                    <Spinner /> Saving...
                  </>
                ) : (
                  "Save changes"
                )}
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
              You have unsaved changes to this category. Leaving now will
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

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this category?</AlertDialogTitle>
            <AlertDialogDescription>
              Deleting only works while no item uses this category. If items
              still reference it, deactivate it instead — it stays on those
              items but disappears from the pickers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmingDelete(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
