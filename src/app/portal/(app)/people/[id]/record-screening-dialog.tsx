"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordPersonScreeningAction } from "./screening-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  PortalFormSurface,
  PortalFormSurfaceClose,
} from "@/components/portal/portal-form-surface";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";

export type ScreeningTierOption = { id: string; name: string };

export function RecordScreeningDialog({
  personId,
  tiers,
  today,
}: {
  personId: string;
  /** Active levels only — a retired one is history, not a new decision. */
  tiers: ScreeningTierOption[];
  /** The tenant's own day, which the action re-checks server side. */
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tierId, setTierId] = useState("");
  // Today rather than blank: a check is recorded the day it comes back far
  // more often than any other day.
  const [clearedOn, setClearedOn] = useState(today);
  const [expiresOn, setExpiresOn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setTierId("");
      setClearedOn(today);
      setExpiresOn("");
      setError(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("tierId", tierId);
    formData.set("clearedOn", clearedOn);
    formData.set("expiresOn", expiresOn);

    startTransition(async () => {
      const result = await recordPersonScreeningAction(personId, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      handleOpenChange(false);
      toast.success("Screening outcome recorded.");
      router.refresh();
    });
  }

  const tierItems = tiers.map((tier) => ({
    value: tier.id,
    label: tier.name,
  }));

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <Button type="button" size="sm" disabled={tiers.length === 0}>
          Record an outcome
        </Button>
      }
      title="Record a screening outcome"
      description="What this person was cleared for, and when. Do not enter anything a check returned — there is nowhere here to put it, and nowhere it belongs."
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
                <Spinner /> Recording...
              </>
            ) : (
              "Record outcome"
            )}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <RequiredFieldsNote />
        <Field>
          <FieldLabel htmlFor="screening-tier" required>
            Cleared for
          </FieldLabel>
          <Select
            value={tierId}
            items={tierItems}
            onValueChange={(value) => setTierId(value ?? "")}
          >
            <SelectTrigger id="screening-tier" aria-label="Screening level">
              <SelectValue placeholder="Choose a level" />
            </SelectTrigger>
            <SelectContent>
              {tierItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="screening-cleared-on" required>
            Date of the decision
          </FieldLabel>
          <Input
            id="screening-cleared-on"
            type="date"
            required
            max={today}
            value={clearedOn}
            onChange={(event) => setClearedOn(event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="screening-expires-on">Runs to</FieldLabel>
          <Input
            id="screening-expires-on"
            type="date"
            min={clearedOn}
            value={expiresOn}
            onChange={(event) => setExpiresOn(event.target.value)}
          />
          <p className="app-muted text-xs">
            Optional. Leave blank where the clearance does not expire. Nothing
            is reminded or blocked when it lapses — the date is shown, and that
            is all.
          </p>
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
