"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Pencil } from "lucide-react";
import { updateScreeningTierAction } from "./actions";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";

export type ScreeningTierRow = {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
};

type FormState = {
  name: string;
  description: string;
  sortOrder: string;
  isActive: boolean;
};

function formStateFor(tier: ScreeningTierRow): FormState {
  return {
    name: tier.name,
    description: tier.description ?? "",
    sortOrder: String(tier.sort_order),
    isActive: tier.is_active,
  };
}

function isDirty(form: FormState, tier: ScreeningTierRow) {
  const baseline = formStateFor(tier);
  return (
    form.name !== baseline.name ||
    form.description !== baseline.description ||
    form.sortOrder !== baseline.sortOrder ||
    form.isActive !== baseline.isActive
  );
}

export function ScreeningTierDetailsSheet({
  tier,
  canManage,
}: {
  tier: ScreeningTierRow;
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<FormState>(() => formStateFor(tier));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [discardTarget, setDiscardTarget] = useState<"toggle" | "close" | null>(
    null,
  );
  const formId = `edit-screening-tier-form-${tier.id}`;
  const dirty = isDirty(form, tier);

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
      setForm(formStateFor(tier));
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
    setForm(formStateFor(tier));
    setError(null);
    setMode("view");
    if (discardTarget === "close") setOpen(false);
    setDiscardTarget(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("name", form.name);
    formData.set("description", form.description);
    formData.set("sortOrder", form.sortOrder);
    formData.set("isActive", form.isActive ? "on" : "off");

    startTransition(async () => {
      const result = await updateScreeningTierAction(tier.id, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("view");
      toast.success("Screening level saved.");
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
                    aria-label={`View ${tier.name}`}
                  />
                }
              />
            }
          >
            <Eye />
          </SheetTrigger>
          <TooltipContent>{`View ${tier.name}`}</TooltipContent>
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
                {mode === "edit" ? "Edit screening level" : "Screening level"}
              </SheetTitle>
              <SheetDescription>
                {mode === "edit"
                  ? "Update what this level is called and what it covers."
                  : "What this level is called and what it covers."}
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
                        aria-label="Edit screening level"
                        onClick={() => setMode("edit")}
                      />
                    }
                  >
                    <Pencil />
                  </TooltipTrigger>
                  <TooltipContent>Edit screening level</TooltipContent>
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
                <ReadOnlyField label="Level" htmlFor="screening-tier-name">
                  {tier.name}
                </ReadOnlyField>
                <ReadOnlyField
                  label="What it covers"
                  htmlFor="screening-tier-description"
                >
                  {tier.description || "—"}
                </ReadOnlyField>
                <ReadOnlyField label="Order" htmlFor="screening-tier-order">
                  {tier.sort_order}
                </ReadOnlyField>
                <ReadOnlyField label="In use" htmlFor="screening-tier-active">
                  {tier.is_active ? "Yes" : "No"}
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
                  <RequiredFieldsNote />
                  <Field>
                    <FieldLabel htmlFor="screening-tier-edit-name" required>
                      Level
                    </FieldLabel>
                    <Input
                      id="screening-tier-edit-name"
                      required
                      value={form.name}
                      onChange={(event) => update("name", event.target.value)}
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="screening-tier-edit-description">
                      What it covers
                    </FieldLabel>
                    <Textarea
                      id="screening-tier-edit-description"
                      value={form.description}
                      onChange={(event) =>
                        update("description", event.target.value)
                      }
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="screening-tier-edit-order">
                      Order
                    </FieldLabel>
                    <Input
                      id="screening-tier-edit-order"
                      type="number"
                      step="1"
                      value={form.sortOrder}
                      onChange={(event) =>
                        update("sortOrder", event.target.value)
                      }
                    />
                  </Field>

                  <Field orientation="horizontal">
                    <Checkbox
                      id="screening-tier-edit-isActive"
                      checked={form.isActive}
                      onCheckedChange={(checked) =>
                        update("isActive", Boolean(checked))
                      }
                    />
                    <FieldLabel htmlFor="screening-tier-edit-isActive">
                      Still in use
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
            <SheetFooter>
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
              You have unsaved changes to this screening level. Leaving now will
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
