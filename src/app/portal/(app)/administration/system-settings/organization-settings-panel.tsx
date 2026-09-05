"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateFiscalYearStartMonthAction,
  type SettingActionResult,
} from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";
// Runtime (not type-only) import: the preview below has to re-describe the
// span as the admin changes the dropdown, before anything is saved.
// @/lib/fiscal-year is deliberately free of server-only imports so this works.
import {
  describeFiscalYearSpan,
  fiscalYearForDate,
  FISCAL_YEAR_START_MONTH_OPTIONS,
  formatFiscalYearLabel,
} from "@/lib/fiscal-year";

const selectClassName =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function OrganizationSettingsPanel({
  fiscalYearStartMonth,
}: {
  fiscalYearStartMonth: number;
}) {
  const router = useRouter();
  const [startMonth, setStartMonth] = useState(fiscalYearStartMonth);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Described from the browser's clock only to give the reader a concrete
  // example of the naming convention; nothing is stored from it.
  const currentFiscalYear = fiscalYearForDate(new Date(), startMonth);
  const label = formatFiscalYearLabel(currentFiscalYear);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      await runAction<SettingActionResult>(
        () => updateFiscalYearStartMonthAction(formData),
        {
          success: "Fiscal year updated.",
          onError: setError,
          onSuccess: () => router.refresh(),
        },
      );
    });
  }

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Fiscal year</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="fiscal-year-start-month">
                  Fiscal year starts in
                </FieldLabel>
                <select
                  id="fiscal-year-start-month"
                  name="startMonth"
                  className={selectClassName}
                  value={startMonth}
                  onChange={(event) =>
                    setStartMonth(Number(event.target.value))
                  }
                  disabled={isPending}
                >
                  {FISCAL_YEAR_START_MONTH_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <FieldDescription>
                  Runs {describeFiscalYearSpan(startMonth)}. A fiscal year is
                  named for the calendar year it ends in, so the one we are in
                  now is {label}. Every annual figure in the portal — the
                  dashboard&apos;s &ldquo;this fiscal year&rdquo; totals, the
                  default range on Financial Reports, the annual planning
                  review, and the year a conflict-of-interest disclosure covers
                  — is counted from this date rather than from January 1.
                </FieldDescription>
              </Field>

              <div className="flex items-center gap-2">
                <Button type="submit" disabled={isPending}>
                  {isPending ? <Spinner className="size-4" /> : null}
                  Save fiscal year
                </Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
