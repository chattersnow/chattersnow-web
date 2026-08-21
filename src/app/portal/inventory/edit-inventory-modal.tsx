"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { updateInventoryItemAction } from "./actions";
import { CONDITIONS, GENDERS, STATUSES, labelFor, type InventoryItem } from "./inventory-shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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

export function EditInventoryModal({ item }: { item: InventoryItem }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => formStateFor(item));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof ReturnType<typeof formStateFor>>(
    key: K,
    value: ReturnType<typeof formStateFor>[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setForm(formStateFor(item));
      setError(null);
    }
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
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger
        render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Edit item" />}
      >
        <Pencil />
      </SheetTrigger>
      <SheetContent side="right" showCloseButton={false} className="data-[side=right]:sm:max-w-lg">
        <SheetHeader className="flex-row items-start gap-2 space-y-0">
          <SheetClose
            render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Close" />}
          >
            <ArrowLeft />
          </SheetClose>
          <div className="flex flex-col gap-0.5">
            <SheetTitle>Edit item</SheetTitle>
            <SheetDescription>Update the details for this inventory item.</SheetDescription>
          </div>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="edit-description">Item description</FieldLabel>
                <Textarea
                  id="edit-description"
                  required
                  value={form.description}
                  onChange={(event) => update("description", event.target.value)}
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
                        {(value: string) => labelFor(GENDERS, value) ?? "Select a gender"}
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
                  <FieldLabel htmlFor="edit-condition">Condition</FieldLabel>
                  <Select
                    value={form.condition || null}
                    onValueChange={(value) => update("condition", value ?? "")}
                  >
                    <SelectTrigger id="edit-condition" className="w-full">
                      <SelectValue placeholder="Select a condition">
                        {(value: string) => labelFor(CONDITIONS, value) ?? "Select a condition"}
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
                        {(value: string) => labelFor(STATUSES, value) ?? "Select a status"}
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
                  <FieldLabel htmlFor="edit-faceValue">Face value ($)</FieldLabel>
                  <Input
                    id="edit-faceValue"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.faceValue}
                    onChange={(event) => update("faceValue", event.target.value)}
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
                  onChange={(event) => update("photoUrl", event.target.value)}
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

          <SheetFooter className="flex-row justify-end border-t bg-muted/50">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save changes"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
