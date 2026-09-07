"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileEdit, Pencil } from "lucide-react";
import {
  publishTemplateVersionAction,
  updateTemplateMetadataAction,
} from "../actions";
import { TemplateFieldsEditor } from "../template-fields-editor";
import type { TemplateListRow } from "../template-shared";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TemplateField } from "../../content-brief-template-shared";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

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

/**
 * Edit stays on a Sheet for this pass (#469): `variant="details"` edits the
 * template's metadata in place, `variant="fields"` publishes a new version
 * of the field list. The detail page renders one instance of each.
 */
export function EditTemplateSheet({
  template,
  variant,
}: {
  template: TemplateListRow;
  variant: "details" | "fields";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [detailsForm, setDetailsForm] = useState<DetailsFormState>(() =>
    detailsFormStateFor(template),
  );
  const [fields, setFields] = useState<TemplateField[]>(template.fields);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const formId = `edit-template-${variant}-form-${template.id}`;
  const dirty =
    variant === "details"
      ? isDetailsDirty(detailsForm, template)
      : !fieldsEqual(fields, template.fields);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && dirty) {
      setConfirmingDiscard(true);
      return;
    }
    setOpen(nextOpen);
    if (nextOpen) {
      // Re-seed from the template on every open: a save + router.refresh()
      // may have replaced the `template` prop since this component mounted.
      setDetailsForm(detailsFormStateFor(template));
      setFields(template.fields);
      setError(null);
    }
  }

  function confirmDiscard() {
    setDetailsForm(detailsFormStateFor(template));
    setFields(template.fields);
    setError(null);
    setConfirmingDiscard(false);
    setOpen(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    if (variant === "details") {
      formData.set("key", detailsForm.key);
      formData.set("name", detailsForm.name);
      formData.set("description", detailsForm.description);
      formData.set("isActive", String(detailsForm.isActive));
      formData.set("requiresConsent", String(detailsForm.requiresConsent));
    } else {
      formData.set("fields", JSON.stringify(fields));
    }

    startTransition(async () => {
      const result =
        variant === "details"
          ? await updateTemplateMetadataAction(template.id, formData)
          : await publishTemplateVersionAction(template.id, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success(
        variant === "details"
          ? "Template details saved."
          : "New template version published.",
      );
      router.refresh();
      setOpen(false);
    });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger
          render={
            <Button
              type="button"
              variant={variant === "details" ? "default" : "secondary"}
            />
          }
        >
          {variant === "details" ? (
            <>
              <Pencil /> Edit details
            </>
          ) : (
            <>
              <FileEdit /> Revise fields
            </>
          )}
        </SheetTrigger>
        <SheetContent side="right" showCloseButton={false} size="lg">
          <SheetHeader className="flex-row items-start gap-2 space-y-0">
            <Tooltip>
              <SheetClose
                render={
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Close"
                      />
                    }
                  />
                }
              >
                <ArrowLeft />
              </SheetClose>
              <TooltipContent>Close</TooltipContent>
            </Tooltip>
            <div className="flex flex-1 flex-col gap-0.5">
              <SheetTitle>
                {variant === "details"
                  ? "Edit template details"
                  : "Revise template fields"}
              </SheetTitle>
              <SheetDescription>
                {variant === "details"
                  ? "Update this template's name, description, and active status."
                  : "Saving publishes a new version. Briefs already built from an earlier version keep their original fields."}
              </SheetDescription>
            </div>
          </SheetHeader>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form
            id={formId}
            onSubmit={handleSubmit}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              {variant === "details" ? (
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
              ) : (
                <TemplateFieldsEditor fields={fields} onChange={setFields} />
              )}
            </div>
          </form>

          <SheetFooter className="flex-row justify-end border-t bg-muted/50">
            <Button type="submit" form={formId} disabled={isPending}>
              {isPending ? (
                <>
                  <Spinner /> Saving...
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={confirmingDiscard}
        onOpenChange={(next) => !next && setConfirmingDiscard(false)}
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
            <AlertDialogCancel onClick={() => setConfirmingDiscard(false)}>
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
