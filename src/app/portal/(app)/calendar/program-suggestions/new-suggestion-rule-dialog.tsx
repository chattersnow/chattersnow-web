"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSuggestionRuleAction } from "./actions";
import { CATEGORIES, ITEM_TYPES } from "../calendar-shared";
import type { Program } from "../../programs/actions";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

function getInitialFormState() {
  return { itemType: "any", category: "any", programId: "", note: "" };
}

export function NewSuggestionRuleDialog({ programs }: { programs: Program[] }) {
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
    formData.set("itemType", form.itemType);
    formData.set("category", form.category);
    formData.set("programId", form.programId);
    formData.set("note", form.note);
    formData.set("isActive", "true");

    startTransition(async () => {
      const result = await createSuggestionRuleAction(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      handleOpenChange(false);
      toast.success("Suggestion rule created.");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={<Button type="button" className="shrink-0 whitespace-nowrap" />}
      >
        New rule
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create program suggestion rule</DialogTitle>
          <DialogDescription>
            When a calendar item matches this item type and/or category, the
            program appears as an editable suggestion in the item editor — it is
            never added automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="rule-itemType">Item type</FieldLabel>
              <Select
                value={form.itemType}
                onValueChange={(value) => update("itemType", value ?? "any")}
              >
                <SelectTrigger id="rule-itemType" className="w-full">
                  <SelectValue placeholder="Any item type">
                    {(value: string) =>
                      value === "any"
                        ? "Any item type"
                        : ITEM_TYPES.find((option) => option.value === value)
                            ?.label
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
              <FieldLabel htmlFor="rule-category">Category</FieldLabel>
              <Select
                value={form.category}
                onValueChange={(value) => update("category", value ?? "any")}
              >
                <SelectTrigger id="rule-category" className="w-full">
                  <SelectValue placeholder="Any category">
                    {(value: string) =>
                      value === "any"
                        ? "Any category"
                        : CATEGORIES.find((option) => option.value === value)
                            ?.label
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
              <FieldLabel htmlFor="rule-program">Suggested program</FieldLabel>
              <Select
                value={form.programId}
                onValueChange={(value) => update("programId", value ?? "")}
              >
                <SelectTrigger id="rule-program" className="w-full">
                  <SelectValue placeholder="Select a program">
                    {(value: string) =>
                      programs.find((program) => program.id === value)?.name
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
              <FieldLabel htmlFor="rule-note">Note</FieldLabel>
              <Textarea
                id="rule-note"
                placeholder="Why this program fits (optional)"
                value={form.note}
                onChange={(event) => update("note", event.target.value)}
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
              ) : (
                "Create rule"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
