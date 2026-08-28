"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Pencil } from "lucide-react";
import {
  revokeAccessGrantAction,
  updateAccessGrantAction,
} from "../../actions";
import { ACCESS_LEVEL_OPTIONS, humanize } from "../../labels";
import type { AccessGrantRow } from "@/lib/portal/access-management/types";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

type FormState = {
  access_level: string;
  account_identifier: string;
  purpose: string;
  expires_at: string;
  notes: string;
};

function formStateFor(grant: AccessGrantRow): FormState {
  return {
    access_level: grant.access_level,
    account_identifier: grant.account_identifier ?? "",
    purpose: grant.purpose ?? "",
    expires_at: grant.expires_at ?? "",
    notes: grant.notes ?? "",
  };
}

export function AccessGrantDetailsSheet({
  grant,
  assetId,
}: {
  grant: AccessGrantRow;
  assetId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<FormState>(() => formStateFor(grant));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [revokeConfirmOpen, setRevokeConfirmOpen] = useState(false);
  const formId = `edit-grant-form-${grant.id}`;
  const isActive = grant.status === "active";

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setForm(formStateFor(grant));
      setError(null);
      setMode("view");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("person_id", grant.person_id);
    formData.set("access_level", form.access_level);
    formData.set("account_identifier", form.account_identifier);
    formData.set("purpose", form.purpose);
    formData.set("expires_at", form.expires_at);
    formData.set("notes", form.notes);

    startTransition(async () => {
      const result = await updateAccessGrantAction(grant.id, assetId, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("view");
      router.refresh();
    });
  }

  function handleRevoke() {
    setError(null);
    startTransition(async () => {
      const result = await revokeAccessGrantAction(grant.id, assetId);
      if ("error" in result) {
        setRevokeConfirmOpen(false);
        setError(result.error);
        return;
      }
      setRevokeConfirmOpen(false);
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
                    aria-label={`View grant for ${grant.person?.name ?? "person"}`}
                  />
                }
              />
            }
          >
            <Eye />
          </SheetTrigger>
          <TooltipContent>View grant</TooltipContent>
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
                {mode === "edit" ? "Edit access grant" : "Access grant"}
              </SheetTitle>
              <SheetDescription>
                {grant.person?.name ?? "Unknown person"}
              </SheetDescription>
            </div>
            {isActive && mode === "view" && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Edit access grant"
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
                <ReadOnlyField label="Access level" htmlFor="grant-view-level">
                  {humanize(grant.access_level)}
                </ReadOnlyField>
                <ReadOnlyField label="Status" htmlFor="grant-view-status">
                  {humanize(grant.status)}
                </ReadOnlyField>
                <ReadOnlyField
                  label="Account identifier"
                  htmlFor="grant-view-account"
                >
                  {grant.account_identifier || "—"}
                </ReadOnlyField>
                <ReadOnlyField label="Purpose" htmlFor="grant-view-purpose">
                  {grant.purpose || "—"}
                </ReadOnlyField>
                <ReadOnlyField label="Granted" htmlFor="grant-view-granted">
                  {grant.granted_at}
                </ReadOnlyField>
                <ReadOnlyField label="Expires" htmlFor="grant-view-expires">
                  {grant.expires_at || "—"}
                </ReadOnlyField>
                <ReadOnlyField
                  label="Last verified"
                  htmlFor="grant-view-verified"
                >
                  {grant.last_verified || "—"}
                </ReadOnlyField>
                {grant.revoked_at && (
                  <ReadOnlyField label="Revoked" htmlFor="grant-view-revoked">
                    {grant.revoked_at}
                  </ReadOnlyField>
                )}
                <ReadOnlyField label="Notes" htmlFor="grant-view-notes">
                  {grant.notes || "—"}
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
                    <FieldLabel htmlFor="grant-edit-level">
                      Access level
                    </FieldLabel>
                    <Select
                      value={form.access_level}
                      onValueChange={(v) =>
                        update("access_level", v ?? form.access_level)
                      }
                    >
                      <SelectTrigger id="grant-edit-level" className="w-full">
                        <SelectValue>
                          {(current: string) =>
                            ACCESS_LEVEL_OPTIONS.find(
                              (option) => option.value === current,
                            )?.label ?? current
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {ACCESS_LEVEL_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="grant-edit-account">
                      Account identifier
                    </FieldLabel>
                    <Input
                      id="grant-edit-account"
                      value={form.account_identifier}
                      onChange={(event) =>
                        update("account_identifier", event.target.value)
                      }
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="grant-edit-purpose">
                      Purpose
                    </FieldLabel>
                    <Input
                      id="grant-edit-purpose"
                      value={form.purpose}
                      onChange={(event) =>
                        update("purpose", event.target.value)
                      }
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="grant-edit-expires">
                      Expires
                    </FieldLabel>
                    <Input
                      id="grant-edit-expires"
                      type="date"
                      value={form.expires_at}
                      onChange={(event) =>
                        update("expires_at", event.target.value)
                      }
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="grant-edit-notes">Notes</FieldLabel>
                    <Textarea
                      id="grant-edit-notes"
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
              <Button
                type="button"
                variant="destructive"
                disabled={isPending}
                onClick={() => setRevokeConfirmOpen(true)}
              >
                Revoke
              </Button>
              <Button type="submit" form={formId} disabled={isPending}>
                {isPending ? "Saving..." : "Save changes"}
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={revokeConfirmOpen} onOpenChange={setRevokeConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this access grant?</AlertDialogTitle>
            <AlertDialogDescription>
              This marks the grant revoked as of today. It stays in the audit
              history and can&apos;t be undone from here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleRevoke}
              disabled={isPending}
            >
              {isPending ? "Revoking..." : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
