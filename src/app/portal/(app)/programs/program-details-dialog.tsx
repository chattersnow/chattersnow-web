"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Pencil } from "lucide-react";
import { updateProgramAction } from "./actions";
import { ProgramStatusBadge, type ProgramRow } from "./program-badges";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
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
import { ReadOnlyField } from "@/components/ui/read-only-field";
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

function formStateFor(program: ProgramRow) {
  return { name: program.name, description: program.description ?? "", status: program.status };
}

export function ProgramDetailsDialog({ program, canManage }: { program: ProgramRow; canManage: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState(() => formStateFor(program));
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
    if (!nextOpen) {
      setMode("view");
      setForm(formStateFor(program));
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
      const result = await updateProgramAction(program.id, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("view");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`View ${program.name}`} />}
      >
        <Eye />
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="flex-row items-start gap-2 space-y-0">
          <DialogClose render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Close" />}>
            <ArrowLeft />
          </DialogClose>
          <div className="flex flex-1 flex-col gap-0.5">
            <DialogTitle>{program.name}</DialogTitle>
            <DialogDescription>
              {mode === "edit" ? "Update this program's details." : "View this program's details."}
            </DialogDescription>
          </div>
          {canManage && mode === "view" && (
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Edit program" onClick={() => setMode("edit")}>
              <Pencil />
            </Button>
          )}
        </DialogHeader>

        {mode === "view" ? (
          <FieldGroup>
            <ReadOnlyField label="Program name" htmlFor="program-name">
              {form.name}
            </ReadOnlyField>
            <ReadOnlyField label="Description" htmlFor="program-description">
              {form.description || "—"}
            </ReadOnlyField>
            <Field>
              <FieldLabel htmlFor="program-status">Status</FieldLabel>
              <div id="program-status">
                <ProgramStatusBadge status={form.status} />
              </div>
            </Field>
          </FieldGroup>
        ) : (
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="program-edit-name">Program name</FieldLabel>
                <Input
                  id="program-edit-name"
                  required
                  value={form.name}
                  onChange={(event) => update("name", event.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="program-edit-description">Description</FieldLabel>
                <Textarea
                  id="program-edit-description"
                  value={form.description}
                  onChange={(event) => update("description", event.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="program-edit-status">Status</FieldLabel>
                <Select value={form.status} onValueChange={(value) => update("status", value ?? "pilot")}>
                  <SelectTrigger id="program-edit-status" className="w-full">
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
              <Button type="button" variant="ghost" onClick={() => setMode("view")}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
