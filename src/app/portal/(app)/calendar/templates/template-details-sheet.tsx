"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, FileEdit, Pencil } from "lucide-react";
import {
  publishTemplateVersionAction,
  updateTemplateMetadataAction,
} from "./actions";
import { TemplateFieldsEditor } from "./template-fields-editor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { TemplateField } from "../content-brief-template-shared";

export type TemplateListRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_active: boolean;
  requires_consent: boolean;
  version: number;
  fields: TemplateField[];
};

type Mode = "view" | "edit-details" | "edit-fields";

type DetailsFormState = {
  key: string;
  name: string;
  description: string;
  isActive: boolean;
  requiresConsent: boolean;
};

function detailsFormStateFor(template: TemplateListRow): DetailsFormState {
  return {
    key: template.key,
    name: template.name,
    description: template.description ?? "",
    isActive: template.is_active,
    requiresConsent: template.requires_consent,
  };
}

function isDetailsDirty(form: DetailsFormState, template: TemplateListRow) {
  const baseline = detailsFormStateFor(template);
  return (
    form.key !== baseline.key ||
    form.name !== baseline.name ||
    form.description !== baseline.description ||
    form.isActive !== baseline.isActive ||
    form.requiresConsent !== baseline.requiresConsent
  );
}

function fieldsEqual(a: TemplateField[], b: TemplateField[]) {
  if (a.length !== b.length) return false;
  return a.every(
    (field, i) =>
      field.key === b[i].key &&
      field.label === b[i].label &&
      field.help_text === b[i].help_text,
  );
}

export function TemplateDetailsSheet({
  template,
  canManage,
}: {
  template: TemplateListRow;
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("view");
  const [detailsForm, setDetailsForm] = useState<DetailsFormState>(() =>
    detailsFormStateFor(template),
  );
  const [fields, setFields] = useState<TemplateField[]>(template.fields);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [discardTarget, setDiscardTarget] = useState<"toggle" | "close" | null>(
    null,
  );
  const formId = `edit-template-form-${template.id}`;
  const dirty =
    mode === "edit-details"
      ? isDetailsDirty(detailsForm, template)
      : mode === "edit-fields"
        ? !fieldsEqual(fields, template.fields)
        : false;

  function resetToView() {
    setDetailsForm(detailsFormStateFor(template));
    setFields(template.fields);
    setError(null);
    setMode("view");
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && mode !== "view" && dirty) {
      setDiscardTarget("close");
      return;
    }
    setOpen(nextOpen);
    if (!nextOpen) resetToView();
  }

  function requestExitEditMode() {
    if (dirty) {
      setDiscardTarget("toggle");
      return;
    }
    resetToView();
  }

  function confirmDiscard() {
    resetToView();
    if (discardTarget === "close") setOpen(false);
    setDiscardTarget(null);
  }

  function handleDetailsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("key", detailsForm.key);
    formData.set("name", detailsForm.name);
    formData.set("description", detailsForm.description);
    formData.set("isActive", String(detailsForm.isActive));
    formData.set("requiresConsent", String(detailsForm.requiresConsent));

    startTransition(async () => {
      const result = await updateTemplateMetadataAction(template.id, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("view");
      router.refresh();
    });
  }

  function handleFieldsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("fields", JSON.stringify(fields));

    startTransition(async () => {
      const result = await publishTemplateVersionAction(template.id, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("view");
      router.refresh();
    });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`View ${template.name}`}
            />
          }
        >
          <Eye />
        </SheetTrigger>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="data-[side=right]:sm:max-w-lg"
        >
          <SheetHeader className="flex-row items-start gap-2 space-y-0">
            <SheetClose
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close"
                />
              }
            >
              <ArrowLeft />
            </SheetClose>
            <div className="flex flex-1 flex-col gap-0.5">
              <SheetTitle>
                {mode === "edit-details"
                  ? "Edit template details"
                  : mode === "edit-fields"
                    ? "Revise template fields"
                    : "Content brief template"}
              </SheetTitle>
              <SheetDescription>
                {mode === "edit-fields"
                  ? "Saving publishes a new version. Briefs already built from an earlier version keep their original fields."
                  : mode === "edit-details"
                    ? "Update this template's name, description, and active status."
                    : "View this template's details."}
              </SheetDescription>
            </div>
            {canManage && mode === "view" && (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Edit template details"
                  onClick={() => setMode("edit-details")}
                >
                  <Pencil />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Revise template fields"
                  onClick={() => setMode("edit-fields")}
                >
                  <FileEdit />
                </Button>
              </div>
            )}
            {canManage && mode !== "view" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={requestExitEditMode}
              >
                View
              </Button>
            )}
          </SheetHeader>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {mode === "view" && (
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <FieldGroup>
                <ReadOnlyField label="Key" htmlFor="template-view-key">
                  {template.key}
                </ReadOnlyField>
                <ReadOnlyField label="Name" htmlFor="template-view-name">
                  {template.name}
                </ReadOnlyField>
                <ReadOnlyField
                  label="Description"
                  htmlFor="template-view-description"
                >
                  {template.description || "—"}
                </ReadOnlyField>
                <ReadOnlyField label="Active" htmlFor="template-view-active">
                  {template.is_active ? "Yes" : "No"}
                </ReadOnlyField>
                <ReadOnlyField
                  label="Requires consent before approval"
                  htmlFor="template-view-requires-consent"
                >
                  {template.requires_consent ? "Yes" : "No"}
                </ReadOnlyField>
                <Field>
                  <FieldLabel htmlFor="template-view-fields">
                    Current fields (v{template.version})
                  </FieldLabel>
                  <ul id="template-view-fields" className="flex flex-col gap-1">
                    {template.fields.map((field) => (
                      <li key={field.key} className="text-sm text-foreground">
                        {field.label}
                        {field.help_text && (
                          <span className="app-muted">
                            {" "}
                            — {field.help_text}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </Field>
              </FieldGroup>
            </div>
          )}

          {mode === "edit-details" && (
            <form
              id={formId}
              onSubmit={handleDetailsSubmit}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="template-edit-key">Key</FieldLabel>
                    <Input
                      id="template-edit-key"
                      required
                      value={detailsForm.key}
                      onChange={(event) =>
                        setDetailsForm((prev) => ({
                          ...prev,
                          key: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="template-edit-name">Name</FieldLabel>
                    <Input
                      id="template-edit-name"
                      required
                      value={detailsForm.name}
                      onChange={(event) =>
                        setDetailsForm((prev) => ({
                          ...prev,
                          name: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="template-edit-description">
                      Description
                    </FieldLabel>
                    <Textarea
                      id="template-edit-description"
                      value={detailsForm.description}
                      onChange={(event) =>
                        setDetailsForm((prev) => ({
                          ...prev,
                          description: event.target.value,
                        }))
                      }
                    />
                  </Field>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={detailsForm.isActive}
                      onCheckedChange={(checked) =>
                        setDetailsForm((prev) => ({
                          ...prev,
                          isActive: checked === true,
                        }))
                      }
                    />
                    Active (shown when staff pick a template for a brief)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={detailsForm.requiresConsent}
                      onCheckedChange={(checked) =>
                        setDetailsForm((prev) => ({
                          ...prev,
                          requiresConsent: checked === true,
                        }))
                      }
                    />
                    Requires recorded consent before approval (e.g. a
                    community-story spotlight)
                  </label>
                </FieldGroup>
              </div>
            </form>
          )}

          {mode === "edit-fields" && (
            <form
              id={formId}
              onSubmit={handleFieldsSubmit}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                <TemplateFieldsEditor fields={fields} onChange={setFields} />
              </div>
            </form>
          )}

          {mode !== "view" && (
            <SheetFooter className="flex-row justify-end border-t bg-muted/50">
              <Button type="submit" form={formId} disabled={isPending}>
                {isPending ? "Saving..." : "Save changes"}
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={discardTarget !== null}
        onOpenChange={(next) => !next && setDiscardTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to this template. Leaving now will
              discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDiscardTarget(null)}>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
