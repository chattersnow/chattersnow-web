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
import { updateMyPreferredNameAction } from "./actions";
import { runAction } from "@/components/portal/action-toast";

export function AccountForm({
  preferredName,
  fallbackName,
}: {
  preferredName: string | null;
  /** Shown as the placeholder: the name used when no preferred name is set. */
  fallbackName: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(preferredName ?? "");
  // Baseline for the dirty check. Tracked in state rather than read straight
  // off the prop so a successful save settles the form immediately, instead of
  // waiting for router.refresh() to feed a new prop back down.
  const [baseline, setBaseline] = useState(preferredName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isDirty = value.trim() !== baseline.trim();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      await runAction(() => updateMyPreferredNameAction(value), {
        success: "Preferred name saved.",
        onError: setError,
        onSuccess: () => {
          setBaseline(value);
          router.refresh();
        },
      });
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
            value={value}
            placeholder={fallbackName}
            disabled={isPending}
            onChange={(event) => setValue(event.target.value)}
          />
          <FieldDescription>
            How your name appears across the portal — in owner lists, on items
            assigned to you, and in the header. Leave it empty to use the name
            on your account.
          </FieldDescription>
        </Field>

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
