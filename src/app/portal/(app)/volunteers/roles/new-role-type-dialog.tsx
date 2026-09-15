"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRoleTypeAction } from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  return { name: "", description: "", isPublic: false };
}

export function NewRoleTypeDialog() {
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
    formData.set("isPublic", form.isPublic ? "on" : "off");

    startTransition(async () => {
      const result = await createRoleTypeAction(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      handleOpenChange(false);
      toast.success("Volunteer role created.");
      router.refresh();
    });
  }

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <Button type="button" className="shrink-0 whitespace-nowrap">
          New role type
        </Button>
      }
      title="Create role type"
      description="A named volunteer job type, e.g. Ride Buddy, Event Setup, Basecamp Staffing."
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
                <Spinner /> Creating...
              </>
            ) : (
              "Create role type"
            )}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <RequiredFieldsNote />
        <Field>
          <FieldLabel htmlFor="name" required>
            Role name
          </FieldLabel>
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

        <Field orientation="horizontal">
          <Checkbox
            id="role-type-isPublic"
            checked={form.isPublic}
            onCheckedChange={(checked) => update("isPublic", Boolean(checked))}
          />
          <FieldLabel htmlFor="role-type-isPublic">
            Show on public site
          </FieldLabel>
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
