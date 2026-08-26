"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { generateMissingCalendarSeriesInstancesAction } from "../recurrence-actions";

export function GenerateMissingButton({ targetYear }: { targetYear: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleGenerateAll() {
    setError(null);
    startTransition(async () => {
      const result =
        await generateMissingCalendarSeriesInstancesAction(targetYear);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button type="button" onClick={handleGenerateAll} disabled={isPending}>
        {isPending ? "Generating…" : `Generate all for ${targetYear}`}
      </Button>
      {error && (
        <Alert variant="destructive" className="max-w-sm">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
