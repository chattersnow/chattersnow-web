"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateOrgTimeZoneAction, type SettingActionResult } from "./actions";
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
import { TIMEZONE_OPTIONS } from "@/lib/time";

const selectClassName =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function TimeZonePanel({ timeZone }: { timeZone: string }) {
  const router = useRouter();
  const [zone, setZone] = useState(timeZone);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      await runAction<SettingActionResult>(
        () => updateOrgTimeZoneAction(formData),
        {
          success: "Time zone updated.",
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
          <CardTitle>Time zone</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="org-time-zone">
                  This organization is in
                </FieldLabel>
                <select
                  id="org-time-zone"
                  name="timeZone"
                  className={selectClassName}
                  value={zone}
                  onChange={(event) => setZone(event.target.value)}
                  disabled={isPending}
                >
                  {TIMEZONE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <FieldDescription>
                  Where a reporting day begins and ends. A sale rung or a
                  reimbursement filed at 7pm on the last day of February counts
                  in February, not in March, because this says which day that
                  moment was. It sets the default period on Financial Reports,
                  the dashboard&apos;s &ldquo;this month&rdquo; figures and the
                  annual planning review. It does <strong>not</strong> change
                  how times are shown: the portal always shows you a time in
                  your own browser&apos;s zone, and the public site shows an
                  event in the zone the event is held in.
                </FieldDescription>
              </Field>

              <div className="flex items-center gap-2">
                <Button type="submit" disabled={isPending}>
                  {isPending ? <Spinner className="size-4" /> : null}
                  Save time zone
                </Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
