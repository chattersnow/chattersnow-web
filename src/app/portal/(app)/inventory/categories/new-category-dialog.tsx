"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createInventoryCategoryAction,
  createInventoryCategoryGroupAction,
} from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

export type CategoryGroupOption = { id: string; label: string };

const NEW_GROUP = "new-group";

function getInitialFormState() {
  return { groupId: "", label: "", sortOrder: "" };
}

export function NewCategoryDialog({
  groups,
}: {
  groups: CategoryGroupOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(getInitialFormState);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const creatingGroup = form.groupId === NEW_GROUP;

  function update<K extends keyof ReturnType<typeof getInitialFormState>>(
    key: K,
    value: ReturnType<typeof getInitialFormState>[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setForm(getInitialFormState());
      setError(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("label", form.label);
    formData.set("sortOrder", form.sortOrder);
    if (!creatingGroup) formData.set("groupId", form.groupId);

    startTransition(async () => {
      const result = creatingGroup
        ? await createInventoryCategoryGroupAction(formData)
        : await createInventoryCategoryAction(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      handleOpenChange(false);
      toast.success(creatingGroup ? "Group created." : "Category created.");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={<Button type="button" className="shrink-0 whitespace-nowrap" />}
      >
        New category
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {creatingGroup ? "Create group" : "Create category"}
          </DialogTitle>
          <DialogDescription>
            Categories are what staff tag an item with; groups exist to organize
            them and to roll up reports. The vocabulary is two levels deep, so a
            group cannot itself sit inside another group.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="category-group">Group</FieldLabel>
              <Select
                value={form.groupId || null}
                onValueChange={(value) =>
                  update("groupId", (value as string) ?? "")
                }
              >
                <SelectTrigger id="category-group" className="w-full">
                  <SelectValue placeholder="Select a group" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.label}
                    </SelectItem>
                  ))}
                  <SelectItem value={NEW_GROUP}>
                    — Create a new group instead —
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="category-label">
                {creatingGroup ? "Group name" : "Category name"}
              </FieldLabel>
              <Input
                id="category-label"
                required
                value={form.label}
                onChange={(event) => update("label", event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="category-sort-order">Sort order</FieldLabel>
              <Input
                id="category-sort-order"
                type="number"
                min={0}
                placeholder="0"
                value={form.sortOrder}
                onChange={(event) => update("sortOrder", event.target.value)}
              />
            </Field>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </FieldGroup>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Spinner /> Creating...
                </>
              ) : creatingGroup ? (
                "Create group"
              ) : (
                "Create category"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
