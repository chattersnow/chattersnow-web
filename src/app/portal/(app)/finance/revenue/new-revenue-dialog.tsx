"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRevenueAction } from "./actions";
import {
  RevenueFormFields,
  emptyRevenueForm,
  packRevenueFormData,
  type RevenueFormState,
} from "./revenue-form-fields";
import type { EventOption } from "./revenue-shared";
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
import { FieldGroup } from "@/components/ui/field";

export function NewRevenueDialog({
  events,
  defaultEventId,
  lockEventSelection,
  triggerLabel = "Add revenue",
  onSaved,
}: {
  events: EventOption[];
  defaultEventId?: string;
  lockEventSelection?: boolean;
  triggerLabel?: string;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<RevenueFormState>(() =>
    emptyRevenueForm(defaultEventId),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof RevenueFormState>(
    key: K,
    value: RevenueFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setForm(emptyRevenueForm(defaultEventId));
      setError(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createRevenueAction(packRevenueFormData(form));
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
      onSaved?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={<Button type="button" className="shrink-0 whitespace-nowrap" />}
      >
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add revenue</DialogTitle>
          <DialogDescription>Record new event revenue.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <RevenueFormFields
              form={form}
              update={update}
              events={events}
              lockEventSelection={lockEventSelection}
              idPrefix="new-revenue"
            />

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </FieldGroup>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Add revenue"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
