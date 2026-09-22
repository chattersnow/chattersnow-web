"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createScreeningTierAction } from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  PortalFormSurface,
  PortalFormSurfaceClose,
} from "@/components/portal/portal-form-surface";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";

function getInitialFormState() {
  return { name: "", description: "", sortOrder: "0" };
}

export function NewScreeningTierDialog() {
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
    formData.set("name", form.name);
    formData.set("description", form.description);
    formData.set("sortOrder", form.sortOrder);
    // A level is in use from the moment it is named; retiring one is an edit.
    formData.set("isActive", "on");

    startTransition(async () => {
      const result = await createScreeningTierAction(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      handleOpenChange(false);
      toast.success("Screening level added.");
      router.refresh();
    });
  }

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <Button type="button" className="shrink-0 whitespace-nowrap">
          New screening level
        </Button>
      }
      title="Add screening level"
      description="A level this organization screens for, in its own words — e.g. Tier 1, or Works with participants."
      onSubmit={handleSubmit}
      footer={
        <>
          <PortalFormSurfaceClose
            render={<Button type="button" variant="secondary" />}
          >
            Cancel
          </PortalFormSurfaceClose>
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Spinner /> Adding...
              </>
            ) : (
              "Add screening level"
            )}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <RequiredFieldsNote />
        <Field>
          <FieldLabel htmlFor="screening-tier-new-name" required>
            Level
          </FieldLabel>
          <Input
            id="screening-tier-new-name"
            required
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="screening-tier-new-description">
            What it covers
          </FieldLabel>
          <Textarea
            id="screening-tier-new-description"
            value={form.description}
            onChange={(event) => update("description", event.target.value)}
          />
          <p className="app-muted text-xs">
            What a role at this level can reach — the roles it applies to, and
            what somebody has to have been through to hold one.
          </p>
        </Field>

        <Field>
          <FieldLabel htmlFor="screening-tier-new-order">Order</FieldLabel>
          <Input
            id="screening-tier-new-order"
            type="number"
            step="1"
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
    </PortalFormSurface>
  );
}
