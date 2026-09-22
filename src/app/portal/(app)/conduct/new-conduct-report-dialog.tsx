"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  PortalFormSurface,
  PortalFormSurfaceClose,
} from "@/components/portal/portal-form-surface";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { createConductReportAction } from "./actions";
import {
  ConductReportFormFields,
  emptyConductReportForm,
  packConductReportForm,
  type ConductReportFormState,
} from "./conduct-report-form-fields";

export function NewConductReportDialog({ today }: { today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ConductReportFormState>(() =>
    emptyConductReportForm(today),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setForm(emptyConductReportForm(today));
      setError(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createConductReportAction(
        packConductReportForm(form),
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      handleOpenChange(false);
      toast.success("Report recorded.");
      // Straight into the case: the next thing intake does is acknowledge it
      // and assign reviewers, and both live there.
      if (result.id) router.push(`/portal/conduct/${result.id}`);
      else router.refresh();
    });
  }

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <Button type="button" className="shrink-0 whitespace-nowrap">
          New report
        </Button>
      }
      title="Record a conduct report"
      description="Whatever channel it arrived on. Nothing here is published, and nobody outside the people assigned to it can read it."
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
              "Record report"
            )}
          </Button>
        </>
      }
    >
      <ConductReportFormFields
        idPrefix="conduct-new"
        state={form}
        onChange={(next) => setForm((prev) => ({ ...prev, ...next }))}
      />
      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </PortalFormSurface>
  );
}
