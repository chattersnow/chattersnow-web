"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Pencil } from "lucide-react";
import { deleteServiceAction, updateServiceAction } from "../actions";
import type { ServiceManageRow } from "@/lib/portal/access-management/types";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";

type FormState = { name: string; website: string; notes: string };

function formStateFor(service: ServiceManageRow): FormState {
  return {
    name: service.name,
    website: service.website ?? "",
    notes: service.notes ?? "",
  };
}

export function ServiceDetailsSheet({
  service,
}: {
  service: ServiceManageRow;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<FormState>(() => formStateFor(service));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const formId = `edit-service-form-${service.id}`;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setForm(formStateFor(service));
      setError(null);
      setMode("view");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateServiceAction(
        service.id,
        form.name,
        form.website,
        form.notes,
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("view");
      router.refresh();
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteServiceAction(service.id);
      if ("error" in result) {
        setDeleteConfirmOpen(false);
        setError(result.error);
        return;
      }
      setDeleteConfirmOpen(false);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <Tooltip>
          <SheetTrigger
            render={
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`View ${service.name}`}
                  />
                }
              />
            }
          >
            <Eye />
          </SheetTrigger>
          <TooltipContent>View service</TooltipContent>
        </Tooltip>
        <SheetContent side="right" showCloseButton={false}>
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
                {mode === "edit" ? "Edit service" : "Service"}
              </SheetTitle>
              <SheetDescription>{service.name}</SheetDescription>
            </div>
            {mode === "view" && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Edit service"
                      onClick={() => setMode("edit")}
                    />
                  }
                >
                  <Pencil />
                </TooltipTrigger>
                <TooltipContent>Edit</TooltipContent>
              </Tooltip>
            )}
            {mode === "edit" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setMode("view")}
              >
                View
              </Button>
            )}
          </SheetHeader>

          {mode === "view" ? (
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <FieldGroup>
                <ReadOnlyField label="Name" htmlFor="service-view-name">
                  {service.name}
                </ReadOnlyField>
                <ReadOnlyField label="Website" htmlFor="service-view-website">
                  {service.website || "—"}
                </ReadOnlyField>
                <ReadOnlyField label="Notes" htmlFor="service-view-notes">
                  {service.notes || "—"}
                </ReadOnlyField>
                <ReadOnlyField
                  label="Assets using this"
                  htmlFor="service-view-count"
                >
                  {service.assetCount}
                </ReadOnlyField>
              </FieldGroup>
            </div>
          ) : (
            <form
              id={formId}
              onSubmit={handleSubmit}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="service-edit-name">Name</FieldLabel>
                    <Input
                      id="service-edit-name"
                      required
                      value={form.name}
                      onChange={(event) => update("name", event.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="service-edit-website">
                      Website
                    </FieldLabel>
                    <Input
                      id="service-edit-website"
                      value={form.website}
                      onChange={(event) =>
                        update("website", event.target.value)
                      }
                      placeholder="https://"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="service-edit-notes">Notes</FieldLabel>
                    <Textarea
                      id="service-edit-notes"
                      value={form.notes}
                      onChange={(event) => update("notes", event.target.value)}
                    />
                  </Field>

                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                </FieldGroup>
              </div>
            </form>
          )}

          {mode === "edit" && (
            <SheetFooter className="flex-row items-center justify-between border-t bg-muted/50">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={isPending || service.assetCount > 0}
                      onClick={() => setDeleteConfirmOpen(true)}
                    />
                  }
                >
                  Delete
                </TooltipTrigger>
                <TooltipContent>
                  {service.assetCount > 0
                    ? `Used by ${service.assetCount} asset${
                        service.assetCount === 1 ? "" : "s"
                      } -- reassign them first`
                    : "Delete this service"}
                </TooltipContent>
              </Tooltip>
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
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &quot;{service.name}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Spinner /> Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
