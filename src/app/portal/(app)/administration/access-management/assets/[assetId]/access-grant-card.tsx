"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import {
  deleteAccessGrantAction,
  revokeAccessGrantAction,
  updateAccessGrantAction,
  verifyAccessGrantAction,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

const STATUS_BADGE_VARIANT: Record<
  string,
  "secondary" | "outline" | "destructive"
> = {
  active: "secondary",
  revoked: "destructive",
  expired: "outline",
};

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

function buildFormData(personId: string, form: FormState) {
  const formData = new FormData();
  formData.set("person_id", personId);
  formData.set("access_level", form.access_level);
  formData.set("account_identifier", form.account_identifier);
  formData.set("purpose", form.purpose);
  formData.set("expires_at", form.expires_at);
  formData.set("notes", form.notes);
  return formData;
}

export function AccessGrantCard({
  grant,
  assetId,
}: {
  grant: AccessGrantRow;
  assetId: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<FormState>(() => formStateFor(grant));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isVerifying, startVerifying] = useTransition();
  const [revokeConfirmOpen, setRevokeConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const personName = grant.person?.name ?? "Unknown person";
  const isActive = grant.status === "active";
  const idPrefix = `grant-${grant.id}`;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function startEditing() {
    // Re-seed from the grant on every edit: a save + router.refresh() may
    // have replaced the `grant` prop since this component mounted.
    setForm(formStateFor(grant));
    setError(null);
    setMode("edit");
  }

  function cancel() {
    setError(null);
    setMode("view");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateAccessGrantAction(
        grant.id,
        assetId,
        buildFormData(grant.person_id, form),
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setMode("view");
      router.refresh();
    });
  }

  function handleVerify() {
    startVerifying(async () => {
      await verifyAccessGrantAction(grant.id, assetId);
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
      setMode("view");
      router.refresh();
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteAccessGrantAction(grant.id, assetId);
      if ("error" in result) {
        setDeleteConfirmOpen(false);
        setError(result.error);
        return;
      }
      setDeleteConfirmOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {personName}
            <Badge
              variant={STATUS_BADGE_VARIANT[grant.status] ?? "outline"}
              className="capitalize"
            >
              {grant.status}
            </Badge>
          </CardTitle>
          {mode === "view" && (
            <CardAction className="flex items-center gap-1">
              {isActive && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isVerifying}
                  onClick={handleVerify}
                >
                  {isVerifying ? (
                    <>
                      <Spinner /> Verifying...
                    </>
                  ) : (
                    "Verify"
                  )}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Edit grant for ${personName}`}
                onClick={startEditing}
              >
                <Pencil />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete grant for ${personName}`}
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 />
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {mode === "view" ? (
            <FieldGroup>
              <ReadOnlyField
                label="Access level"
                htmlFor={`${idPrefix}-view-level`}
              >
                {humanize(grant.access_level)}
              </ReadOnlyField>
              <ReadOnlyField
                label="Account identifier"
                htmlFor={`${idPrefix}-view-account`}
              >
                {grant.account_identifier || "—"}
              </ReadOnlyField>
              <ReadOnlyField
                label="Purpose"
                htmlFor={`${idPrefix}-view-purpose`}
              >
                {grant.purpose || "—"}
              </ReadOnlyField>
              <ReadOnlyField
                label="Granted"
                htmlFor={`${idPrefix}-view-granted`}
              >
                {grant.granted_at}
              </ReadOnlyField>
              <ReadOnlyField
                label="Expires"
                htmlFor={`${idPrefix}-view-expires`}
              >
                {grant.expires_at || "—"}
              </ReadOnlyField>
              <ReadOnlyField
                label="Last verified"
                htmlFor={`${idPrefix}-view-verified`}
              >
                {grant.last_verified || "—"}
              </ReadOnlyField>
              {grant.revoked_at && (
                <ReadOnlyField
                  label="Revoked"
                  htmlFor={`${idPrefix}-view-revoked`}
                >
                  {grant.revoked_at}
                </ReadOnlyField>
              )}
              <ReadOnlyField label="Notes" htmlFor={`${idPrefix}-view-notes`}>
                {grant.notes || "—"}
              </ReadOnlyField>
            </FieldGroup>
          ) : (
            <form onSubmit={handleSubmit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={`${idPrefix}-edit-level`}>
                    Access level
                  </FieldLabel>
                  <Select
                    value={form.access_level}
                    onValueChange={(v) =>
                      update("access_level", v ?? form.access_level)
                    }
                  >
                    <SelectTrigger
                      id={`${idPrefix}-edit-level`}
                      className="w-full"
                    >
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
                  <FieldLabel htmlFor={`${idPrefix}-edit-account`}>
                    Account identifier
                  </FieldLabel>
                  <Input
                    id={`${idPrefix}-edit-account`}
                    value={form.account_identifier}
                    onChange={(event) =>
                      update("account_identifier", event.target.value)
                    }
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor={`${idPrefix}-edit-purpose`}>
                    Purpose
                  </FieldLabel>
                  <Input
                    id={`${idPrefix}-edit-purpose`}
                    value={form.purpose}
                    onChange={(event) => update("purpose", event.target.value)}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor={`${idPrefix}-edit-expires`}>
                    Expires
                  </FieldLabel>
                  <Input
                    id={`${idPrefix}-edit-expires`}
                    type="date"
                    value={form.expires_at}
                    onChange={(event) =>
                      update("expires_at", event.target.value)
                    }
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor={`${idPrefix}-edit-notes`}>
                    Notes
                  </FieldLabel>
                  <Textarea
                    id={`${idPrefix}-edit-notes`}
                    value={form.notes}
                    onChange={(event) => update("notes", event.target.value)}
                  />
                </Field>
              </FieldGroup>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                {isActive ? (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={isPending}
                    onClick={() => setRevokeConfirmOpen(true)}
                  >
                    Revoke
                  </Button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={cancel}
                    disabled={isPending}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isPending}>
                    {isPending ? (
                      <>
                        <Spinner /> Saving...
                      </>
                    ) : (
                      "Save changes"
                    )}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

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
              {isPending ? (
                <>
                  <Spinner /> Revoking...
                </>
              ) : (
                "Revoke"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this access grant?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the grant record for {personName} &mdash;
              unlike revoking, it isn&apos;t kept for audit history. This
              can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
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
