"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCalendarCategoryAction } from "./actions";
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
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

function getInitialFormState() {
  return { label: "", sortOrder: "" };
}

export function NewCalendarCategoryDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(getInitialFormState);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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

    startTransition(async () => {
      const result = await createCalendarCategoryAction(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      handleOpenChange(false);
      toast.success("Category created.");
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create category</DialogTitle>
          <DialogDescription>
            Calendar items are tagged with these, and visitors filter the public
            community calendar by them. The name is yours to choose; a key is
            derived from it once and then left alone, so a later rename never
            disturbs the items already tagged.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <Field>
              <FieldLabel htmlFor="calendar-category-label">Name</FieldLabel>
              <Input
                id="calendar-category-label"
                name="label"
                value={form.label}
                onChange={(event) => update("label", event.target.value)}
                placeholder="e.g. Our events"
                required
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="calendar-category-sort-order">
                Sort order
              </FieldLabel>
              <Input
                id="calendar-category-sort-order"
                name="sortOrder"
                type="number"
                min={0}
                value={form.sortOrder}
                onChange={(event) => update("sortOrder", event.target.value)}
                placeholder="0"
              />
            </Field>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Spinner /> : null}
              Create category
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
