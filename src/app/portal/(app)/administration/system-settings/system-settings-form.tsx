"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateExpenseApprovalThresholdAction,
  updateReimbursementApprovalThresholdAction,
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

function ThresholdCard({
  title,
  idPrefix,
  description,
  initialValue,
  action,
}: {
  title: string;
  idPrefix: string;
  description: string;
  initialValue: number | null;
  action: (formData: FormData) => Promise<SettingActionResult>;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await action(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSuccess(true);
      router.refresh();
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
              <FieldLabel htmlFor={`${idPrefix}-threshold`}>
                Threshold (USD)
              </FieldLabel>
              <Input
                id={`${idPrefix}-threshold`}
                name="threshold"
                type="number"
                min="0"
                step="0.01"
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
            {success && (
              <Alert>
                <AlertDescription>Threshold updated.</AlertDescription>
              </Alert>
            )}

            <div>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

export function SystemSettingsForm({
  expenseApprovalThreshold,
  reimbursementApprovalThreshold,
}: {
  expenseApprovalThreshold: number | null;
  reimbursementApprovalThreshold: number | null;
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
    </div>
  );
}
