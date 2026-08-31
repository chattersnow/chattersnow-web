"use client";

import { FormEvent, useState, useTransition } from "react";
import { createDiscountCodesAction } from "./discount-codes-actions";
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
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";

export function AddDiscountCodesDialog({
  eventId,
  triggerLabel = "+ Add codes",
  onSaved,
}: {
  eventId: string;
  triggerLabel?: string;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [codes, setCodes] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setCodes("");
    setDescription("");
    setSource("");
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) reset();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("codes", codes);
    formData.set("description", description);
    formData.set("source", source);

    startTransition(async () => {
      const result = await createDiscountCodesAction(eventId, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      handleOpenChange(false);
      onSaved?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="secondary"
            className="shrink-0 whitespace-nowrap"
          />
        }
      >
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add discount codes</DialogTitle>
          <DialogDescription>
            Add a batch of discount codes for this event.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="discount-codes-batch">
                Codes (one per line)
              </FieldLabel>
              <Textarea
                id="discount-codes-batch"
                placeholder={"SPRING10\nSPRING11\nSPRING12"}
                value={codes}
                onChange={(event) => setCodes(event.target.value)}
                rows={6}
              />
            </Field>

            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="discount-codes-description">
                  Discount description
                </FieldLabel>
                <Input
                  id="discount-codes-description"
                  placeholder="e.g. $10 off"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="discount-codes-source">Source</FieldLabel>
                <Input
                  id="discount-codes-source"
                  placeholder="e.g. ACME Vendor"
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                />
              </Field>
            </Field>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </FieldGroup>

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Spinner /> Saving...
                </>
              ) : (
                "Add codes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
