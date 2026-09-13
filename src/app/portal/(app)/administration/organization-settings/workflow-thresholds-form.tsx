"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateExpenseApprovalThresholdAction,
  updateReimbursementApprovalThresholdAction,
  updateSalesTaxRateAction,
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
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";

/**
 * One numeric setting with its own Save. The field defaults describe a USD
 * threshold; the sales tax card below overrides them for a percent.
 */
function ThresholdCard({
  title,
  idPrefix,
  description,
  initialValue,
  action,
  fieldName = "threshold",
  fieldLabel = "Threshold (USD)",
  max,
  step = "0.01",
}: {
  title: string;
  idPrefix: string;
  description: string;
  initialValue: number | null;
  action: (formData: FormData) => Promise<SettingActionResult>;
  fieldName?: string;
  fieldLabel?: string;
  max?: string;
  step?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      await runAction(() => action(formData), {
        // `title` is already "<X> approval threshold" -- naming it again
        // here read as "Expense approval threshold threshold updated."
        success: `${title} updated.`,
        onError: setError,
        onSuccess: () => router.refresh(),
      });
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-${fieldName}`}>
                {fieldLabel}
              </FieldLabel>
              <Input
                id={`${idPrefix}-${fieldName}`}
                name={fieldName}
                type="number"
                min="0"
                max={max}
                step={step}
                required
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
              <FieldDescription>{description}</FieldDescription>
            </Field>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div>
              <Button type="submit" disabled={isPending}>
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
      </CardContent>
    </Card>
  );
}

export function WorkflowThresholdsForm({
  expenseApprovalThreshold,
  reimbursementApprovalThreshold,
  salesTaxRate,
}: {
  expenseApprovalThreshold: number | null;
  reimbursementApprovalThreshold: number | null;
  /** Percent. */
  salesTaxRate: number | null;
}) {
  return (
    <div className="space-y-6">
      <ThresholdCard
        title="Expense approval threshold"
        idPrefix="expense"
        description="Below this amount, finance can self-approve their own expense submissions. At or above it, a second approval from admin or board is required."
        initialValue={expenseApprovalThreshold}
        action={updateExpenseApprovalThresholdAction}
      />
      <ThresholdCard
        title="Reimbursement approval threshold"
        idPrefix="reimbursement"
        description="Below this amount, finance can self-approve their own reimbursement submissions. At or above it, a second approval from admin or board is required."
        initialValue={reimbursementApprovalThreshold}
        action={updateReimbursementApprovalThresholdAction}
      />
      <ThresholdCard
        title="Sales tax rate"
        idPrefix="sales-tax"
        fieldName="rate"
        fieldLabel="Rate (%)"
        max="100"
        step="0.001"
        description="Prefilled on every sale at the register, where the cashier can change it for one sale. Tax is added on top of the pre-tax prices in the catalog, and what is collected is reported separately from income. Changing it here never alters a sale already recorded."
        initialValue={salesTaxRate}
        action={updateSalesTaxRateAction}
      />
    </div>
  );
}
