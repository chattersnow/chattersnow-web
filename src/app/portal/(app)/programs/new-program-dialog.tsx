"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProgramAction } from "./actions";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUSES = [
  { value: "pilot", label: "Pilot" },
  { value: "active", label: "Active" },
  { value: "retired", label: "Retired" },
];

function getInitialFormState() {
  return { name: "", description: "", status: "pilot" };
}

export function NewProgramDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(getInitialFormState);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof ReturnType<typeof getInitialFormState>>(
    key: K,
    value: ReturnType<typeof getInitialFormState>[K]
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
    formData.set("name", form.name);
    formData.set("description", form.description);
    formData.set("status", form.status);

    startTransition(async () => {
      const result = await createProgramAction(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      handleOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button type="button" className="shrink-0 whitespace-nowrap" />}>
        New program
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create program</DialogTitle>
          <DialogDescription>
            A named, repeatable initiative that events can be tagged to.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Program name</FieldLabel>
              <Input
                id="name"
                required
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="description">Description</FieldLabel>
              <Textarea
                id="description"
                value={form.description}
                onChange={(event) => update("description", event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="status">Status</FieldLabel>
              <Select value={form.status} onValueChange={(value) => update("status", value ?? "pilot")}>
                <SelectTrigger id="status" className="w-full">
                  <SelectValue placeholder="Select status">
                    {(value: string) => STATUSES.find((option) => option.value === value)?.label ?? "Select status"}
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

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </FieldGroup>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating..." : "Create program"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
