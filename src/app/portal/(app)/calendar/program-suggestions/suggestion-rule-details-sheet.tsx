"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Pencil, Trash2 } from "lucide-react";
import {
  deleteSuggestionRuleAction,
  updateSuggestionRuleAction,
} from "./actions";
import { CATEGORIES, ITEM_TYPES, labelFor } from "../calendar-shared";
import type { Program } from "../../programs/actions";
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

export type SuggestionRuleListRow = {
  id: string;
  item_type: string | null;
  category: string | null;
  program_id: string;
  note: string | null;
  is_active: boolean;
};

function formStateFor(rule: SuggestionRuleListRow) {
  return {
    itemType: rule.item_type ?? "any",
    category: rule.category ?? "any",
    programId: rule.program_id,
    note: rule.note ?? "",
    isActive: rule.is_active,
  };
}

type FormState = ReturnType<typeof formStateFor>;

function isDirty(form: FormState, rule: SuggestionRuleListRow) {
  const baseline = formStateFor(rule);
  return (
    form.itemType !== baseline.itemType ||
    form.category !== baseline.category ||
    form.programId !== baseline.programId ||
    form.note !== baseline.note ||
    form.isActive !== baseline.isActive
  );
}

export function SuggestionRuleDetailsSheet({
  rule,
  programs,
  canManage,
}: {
  rule: SuggestionRuleListRow;
  programs: Program[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<FormState>(() => formStateFor(rule));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [discardTarget, setDiscardTarget] = useState<"toggle" | "close" | null>(
    null,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const formId = `edit-suggestion-rule-form-${rule.id}`;
  const dirty = isDirty(form, rule);
  const programName =
    programs.find((program) => program.id === rule.program_id)?.name ??
    "Unknown program";

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && mode === "edit" && dirty) {
      setDiscardTarget("close");
      return;
    }
    setOpen(nextOpen);
    if (!nextOpen) {
      setMode("view");
      setForm(formStateFor(rule));
      setError(null);
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
    setForm(formStateFor(rule));
    setError(null);
    setMode("view");
    if (discardTarget === "close") setOpen(false);
    setDiscardTarget(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("itemType", form.itemType);
    formData.set("category", form.category);
    formData.set("programId", form.programId);
    formData.set("note", form.note);
    formData.set("isActive", String(form.isActive));

    startTransition(async () => {
      const result = await updateSuggestionRuleAction(rule.id, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("view");
      toast.success("Suggestion rule deleted.");
      router.refresh();
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteSuggestionRuleAction(rule.id);
      if ("error" in result) {
        setError(result.error);
        setConfirmDelete(false);
        return;
      }
      setConfirmDelete(false);
      setOpen(false);
      toast.success("Suggestion rule deleted.");
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
                    aria-label={`View rule suggesting ${programName}`}
                  />
                }
              />
            }
          >
            <Eye />
          </SheetTrigger>
          <TooltipContent>{`View rule suggesting ${programName}`}</TooltipContent>
        </Tooltip>
        <SheetContent side="right" showCloseButton={false} size="lg">
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
              <SheetTitle>{programName}</SheetTitle>
              <SheetDescription>
                {mode === "edit"
                  ? "Update this suggestion rule."
                  : "View this suggestion rule's details."}
              </SheetDescription>
            </div>
            {canManage && mode === "view" && (
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete rule"
                        onClick={() => setConfirmDelete(true)}
                      />
                    }
                  >
                    <Trash2 />
                  </TooltipTrigger>
                  <TooltipContent>Delete rule</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Edit rule"
                        onClick={() => setMode("edit")}
                      />
                    }
                  >
                    <Pencil />
                  </TooltipTrigger>
                  <TooltipContent>Edit rule</TooltipContent>
                </Tooltip>
              </div>
            )}
            {canManage && mode === "edit" && (
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

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {mode === "view" ? (
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <FieldGroup>
                <ReadOnlyField label="Item type" htmlFor="rule-view-itemType">
                  {rule.item_type
                    ? labelFor(ITEM_TYPES, rule.item_type)
                    : "Any"}
                </ReadOnlyField>
                <ReadOnlyField label="Category" htmlFor="rule-view-category">
                  {rule.category ? labelFor(CATEGORIES, rule.category) : "Any"}
                </ReadOnlyField>
                <ReadOnlyField label="Note" htmlFor="rule-view-note">
                  {rule.note || "—"}
                </ReadOnlyField>
                <ReadOnlyField label="Active" htmlFor="rule-view-active">
                  {rule.is_active ? "Yes" : "No"}
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
                    <FieldLabel htmlFor="rule-edit-itemType">
                      Item type
                    </FieldLabel>
                    <Select
                      value={form.itemType}
                      onValueChange={(value) =>
                        update("itemType", value ?? "any")
                      }
                    >
                      <SelectTrigger id="rule-edit-itemType" className="w-full">
                        <SelectValue placeholder="Any item type">
                          {(value: string) =>
                            value === "any"
                              ? "Any item type"
                              : ITEM_TYPES.find(
                                  (option) => option.value === value,
                                )?.label
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any item type</SelectItem>
                        {ITEM_TYPES.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="rule-edit-category">
                      Category
                    </FieldLabel>
                    <Select
                      value={form.category}
                      onValueChange={(value) =>
                        update("category", value ?? "any")
                      }
                    >
                      <SelectTrigger id="rule-edit-category" className="w-full">
                        <SelectValue placeholder="Any category">
                          {(value: string) =>
                            value === "any"
                              ? "Any category"
                              : CATEGORIES.find(
                                  (option) => option.value === value,
                                )?.label
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any category</SelectItem>
                        {CATEGORIES.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="rule-edit-program">
                      Suggested program
                    </FieldLabel>
                    <Select
                      value={form.programId}
                      onValueChange={(value) =>
                        update("programId", value ?? form.programId)
                      }
                    >
                      <SelectTrigger id="rule-edit-program" className="w-full">
                        <SelectValue placeholder="Select a program">
                          {(value: string) =>
                            programs.find((program) => program.id === value)
                              ?.name
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {programs.map((program) => (
                          <SelectItem key={program.id} value={program.id}>
                            {program.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="rule-edit-note">Note</FieldLabel>
                    <Textarea
                      id="rule-edit-note"
                      value={form.note}
                      onChange={(event) => update("note", event.target.value)}
                    />
                  </Field>

                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.isActive}
                      onCheckedChange={(checked) =>
                        update("isActive", checked === true)
                      }
                    />
                    Active (shown as a suggestion when editing a matching item)
                  </label>
                </FieldGroup>
              </div>

              <SheetFooter className="flex-row justify-end border-t bg-muted/50">
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
            </form>
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
              You have unsaved changes to this rule. Leaving now will discard
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

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this rule?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the suggestion for {programName}. It won&apos;t
              affect programs already added to any calendar item.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isPending}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
