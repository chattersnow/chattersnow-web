"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTemplateAction } from "./actions";
import { TemplateFieldsEditor } from "./template-fields-editor";
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
import type { TemplateField } from "../content-brief-template-shared";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";

function getInitialFormState() {
  return { key: "", name: "", description: "", requiresConsent: false };
}

export function NewTemplateDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(getInitialFormState);
  const [fields, setFields] = useState<TemplateField[]>([
    { key: "", label: "", help_text: null },
  ]);
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
      setFields([{ key: "", label: "", help_text: null }]);
      setError(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("key", form.key);
    formData.set("name", form.name);
    formData.set("description", form.description);
    formData.set("isActive", "true");
    formData.set("requiresConsent", String(form.requiresConsent));
    formData.set("fields", JSON.stringify(fields));

    startTransition(async () => {
      const result = await createTemplateAction(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      handleOpenChange(false);
      toast.success("Brief template created.");
      router.refresh();
    });
  }

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <Button type="button" className="shrink-0 whitespace-nowrap">
          New template
        </Button>
      }
      title="Create content brief template"
      description="Defines the structure a brief starts from when staff pick this template — it never publishes content on its own."
      size="2xl"
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
              "Create template"
            )}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <RequiredFieldsNote />
        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="template-key" required>
              Key
            </FieldLabel>
            <Input
              id="template-key"
              required
              placeholder="e.g. community_spotlight"
              value={form.key}
              onChange={(event) => update("key", event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="template-name" required>
              Name
            </FieldLabel>
            <Input
              id="template-name"
              required
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
            />
          </Field>
        </Field>

        <Field>
          <FieldLabel htmlFor="template-description">Description</FieldLabel>
          <Textarea
            id="template-description"
            value={form.description}
            onChange={(event) => update("description", event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="template-fields">Fields</FieldLabel>
          <div id="template-fields">
            <TemplateFieldsEditor fields={fields} onChange={setFields} />
          </div>
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={form.requiresConsent}
            onCheckedChange={(checked) =>
              update("requiresConsent", checked === true)
            }
          />
          Requires recorded consent before approval (e.g. a community-story
          spotlight)
        </label>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
    </PortalFormSurface>
  );
}
