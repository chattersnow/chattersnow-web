"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { PronounsField } from "@/components/pronouns-field";
import { updateMyPreferredNameAction, updateMyPronounsAction } from "./actions";
import { runAction } from "@/components/portal/action-toast";

export function AccountForm({
  preferredName,
  pronouns,
  fallbackName,
}: {
  preferredName: string | null;
  pronouns: string | null;
  /** Shown as the placeholder: the name used when no preferred name is set. */
  fallbackName: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState({
    preferredName: preferredName ?? "",
    pronouns: pronouns ?? "",
  });
  // Baseline for the dirty check. Tracked in state rather than read straight
  // off the props so a successful save settles the form immediately, instead of
  // waiting for router.refresh() to feed new props back down.
  const [baseline, setBaseline] = useState(values);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const preferredNameChanged =
    values.preferredName.trim() !== baseline.preferredName.trim();
  const pronounsChanged = values.pronouns.trim() !== baseline.pronouns.trim();
  const isDirty = preferredNameChanged || pronounsChanged;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    // Each field has its own single-purpose RPC, so a save touches only what
    // actually changed and the receipt names it.
    const success =
      preferredNameChanged && pronounsChanged
        ? "Account updated."
        : pronounsChanged
          ? "Pronouns saved."
          : "Preferred name saved.";

    startTransition(async () => {
      await runAction(
        async (): Promise<{ error: string } | { success: true }> => {
          if (preferredNameChanged) {
            const result = await updateMyPreferredNameAction(
              values.preferredName,
            );
            if ("error" in result) return result;
          }
          if (pronounsChanged) {
            const result = await updateMyPronounsAction(values.pronouns);
            if ("error" in result) return result;
          }
          return { success: true };
        },
        {
          success,
          onError: setError,
          onSuccess: () => {
            setBaseline(values);
            router.refresh();
          },
        },
      );
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="preferredName">Preferred name</FieldLabel>
          <Input
            id="preferredName"
            name="preferredName"
            value={values.preferredName}
            placeholder={fallbackName}
            disabled={isPending}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                preferredName: event.target.value,
              }))
            }
          />
          <FieldDescription>
            How your name appears across the portal — in owner lists, on items
            assigned to you, and in the header. Leave it empty to use the name
            on your account.
          </FieldDescription>
        </Field>

        <PronounsField
          id="pronouns"
          value={values.pronouns}
          disabled={isPending}
          onChange={(value) =>
            setValues((current) => ({ ...current, pronouns: value }))
          }
          description="Optional. Shown on your record so the rest of the team refers to you correctly. Leave it empty to say nothing."
        />

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={isPending || !isDirty}>
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
