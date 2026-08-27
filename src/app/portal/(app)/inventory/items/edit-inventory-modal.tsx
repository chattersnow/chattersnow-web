"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, Eye, ImageOff, Pencil } from "lucide-react";
import { updateInventoryItemAction } from "./actions";
import {
  CONDITIONS,
  GENDERS,
  STATUSES,
  StatusBadge,
  formatFaceValue,
  labelFor,
  resolveImageUrl,
  type InventoryItem,
} from "./inventory-shared";
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

function formStateFor(item: InventoryItem) {
  return {
    description: item.description,
    type: item.type,
    size: item.size ?? "",
    gender: item.gender ?? "",
    condition: item.condition,
    status: item.status,
    faceValue: item.face_value === null ? "" : String(item.face_value),
    photoUrl: item.photo_url ?? "",
    notes: item.notes ?? "",
  };
}

type InventoryFormState = ReturnType<typeof formStateFor>;

function isDirty(form: InventoryFormState, item: InventoryItem) {
  const baseline = formStateFor(item);
  return (Object.keys(baseline) as (keyof InventoryFormState)[]).some(
    (key) => form[key] !== baseline[key],
  );
}

export function EditInventoryModal({ item }: { item: InventoryItem }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState(() => formStateFor(item));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [discardTarget, setDiscardTarget] = useState<"toggle" | "close" | null>(
    null,
  );
  const formId = `edit-inventory-form-${item.id}`;
  const dirty = isDirty(form, item);
  const imageUrl = resolveImageUrl(item.photo_url);

  function update<K extends keyof InventoryFormState>(
    key: K,
    value: InventoryFormState[K],
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
      setForm(formStateFor(item));
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
    setForm(formStateFor(item));
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
    formData.set("description", form.description);
    formData.set("type", form.type);
    formData.set("size", form.size);
    formData.set("gender", form.gender);
    formData.set("condition", form.condition);
    formData.set("status", form.status);
    formData.set("faceValue", form.faceValue);
    formData.set("photoUrl", form.photoUrl);
    formData.set("notes", form.notes);

    startTransition(async () => {
      const result = await updateInventoryItemAction(item.id, formData);
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
        <Tooltip>
          <SheetTrigger
            render={
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="View item"
                  />
                }
              />
            }
          >
            <Eye />
          </SheetTrigger>
          <TooltipContent>View item</TooltipContent>
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
              <SheetTitle>{mode === "edit" ? "Edit item" : "Item"}</SheetTitle>
              <SheetDescription>
                {mode === "edit"
                  ? "Update the details for this inventory item."
                  : "View this item's details."}
              </SheetDescription>
            </div>
            {mode === "view" ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Edit item"
                      onClick={() => setMode("edit")}
                    />
                  }
                >
                  <Pencil />
                </TooltipTrigger>
                <TooltipContent>Edit item</TooltipContent>
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
            )}
          </SheetHeader>

          {mode === "view" ? (
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <div className="relative mb-4 aspect-square w-full overflow-hidden rounded-lg bg-muted">
                {imageUrl ? (
                  <Image
                    src={imageUrl}
                    alt={item.description}
                    fill
                    sizes="(min-width: 640px) 28rem, 100vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ImageOff
                      className="size-10 text-muted-foreground"
                      aria-hidden
                    />
                  </div>
                )}
              </div>
              <FieldGroup>
                <ReadOnlyField
                  label="Item description"
                  htmlFor="edit-description"
                >
                  {item.description}
                </ReadOnlyField>
                <Field orientation="responsive">
                  <ReadOnlyField label="Item type" htmlFor="edit-type">
                    {item.type}
                  </ReadOnlyField>
                  <ReadOnlyField label="Size" htmlFor="edit-size">
                    {item.size || "—"}
                  </ReadOnlyField>
                </Field>
                <Field orientation="responsive">
                  <ReadOnlyField label="Gender" htmlFor="edit-gender">
                    {labelFor(GENDERS, item.gender ?? "") || "—"}
                  </ReadOnlyField>
                  <ReadOnlyField label="Condition" htmlFor="edit-condition">
                    {labelFor(CONDITIONS, item.condition) || "—"}
                  </ReadOnlyField>
                </Field>
                {item.status === "reserved" && item.holdRequester && (
                  <ReadOnlyField
                    label="Requested by"
                    htmlFor="edit-hold-requester"
                  >
                    {[
                      item.holdRequester.name,
                      item.holdRequester.email,
                      item.holdRequester.phone,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </ReadOnlyField>
                )}
                <Field orientation="responsive">
                  <Field>
                    <FieldLabel htmlFor="edit-status">Status</FieldLabel>
                    <div id="edit-status">
                      <StatusBadge status={item.status} />
                    </div>
                  </Field>
                  <ReadOnlyField label="Face value" htmlFor="edit-faceValue">
                    {formatFaceValue(item.face_value)}
                  </ReadOnlyField>
                </Field>
                <ReadOnlyField label="Photo URL" htmlFor="edit-photoUrl">
                  {item.photo_url || "—"}
                </ReadOnlyField>
                <ReadOnlyField label="Item notes" htmlFor="edit-notes">
                  {item.notes || "—"}
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
                    <FieldLabel htmlFor="edit-description">
                      Item description
                    </FieldLabel>
                    <Textarea
                      id="edit-description"
                      required
                      value={form.description}
                      onChange={(event) =>
                        update("description", event.target.value)
                      }
                    />
                  </Field>

                  <Field orientation="responsive">
                    <Field>
                      <FieldLabel htmlFor="edit-type">Item type</FieldLabel>
                      <Input
                        id="edit-type"
                        required
                        value={form.type}
                        onChange={(event) => update("type", event.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="edit-size">Size</FieldLabel>
                      <Input
                        id="edit-size"
                        value={form.size}
                        onChange={(event) => update("size", event.target.value)}
                      />
                    </Field>
                  </Field>

                  <Field orientation="responsive">
                    <Field>
                      <FieldLabel htmlFor="edit-gender">Gender</FieldLabel>
                      <Select
                        value={form.gender || null}
                        onValueChange={(value) => update("gender", value ?? "")}
                      >
                        <SelectTrigger id="edit-gender" className="w-full">
                          <SelectValue placeholder="Select a gender">
                            {(value: string) =>
                              labelFor(GENDERS, value) ?? "Select a gender"
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {GENDERS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="edit-condition">
                        Condition
                      </FieldLabel>
                      <Select
                        value={form.condition || null}
                        onValueChange={(value) =>
                          update("condition", value ?? "")
                        }
                      >
                        <SelectTrigger id="edit-condition" className="w-full">
                          <SelectValue placeholder="Select a condition">
                            {(value: string) =>
                              labelFor(CONDITIONS, value) ??
                              "Select a condition"
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {CONDITIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </Field>

                  <Field orientation="responsive">
                    <Field>
                      <FieldLabel htmlFor="edit-status">Status</FieldLabel>
                      <Select
                        value={form.status || null}
                        onValueChange={(value) => update("status", value ?? "")}
                      >
                        <SelectTrigger id="edit-status" className="w-full">
                          <SelectValue placeholder="Select a status">
                            {(value: string) =>
                              labelFor(STATUSES, value) ?? "Select a status"
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="edit-faceValue">
                        Face value ($)
                      </FieldLabel>
                      <Input
                        id="edit-faceValue"
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.faceValue}
                        onChange={(event) =>
                          update("faceValue", event.target.value)
                        }
                      />
                    </Field>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="edit-photoUrl">Photo URL</FieldLabel>
                    <Input
                      id="edit-photoUrl"
                      type="url"
                      placeholder="https://..."
                      value={form.photoUrl}
                      onChange={(event) =>
                        update("photoUrl", event.target.value)
                      }
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="edit-notes">Item notes</FieldLabel>
                    <Textarea
                      id="edit-notes"
                      value={form.notes}
                      onChange={(event) => update("notes", event.target.value)}
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
              You have unsaved changes to this item. Leaving now will discard
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
    </>
  );
}
