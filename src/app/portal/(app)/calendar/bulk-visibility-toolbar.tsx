"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { VISIBILITIES } from "./calendar-shared";
import { updateCalendarItemsVisibilityAction } from "./actions";

export function BulkVisibilityToolbar({
  selectedIds,
  onDone,
}: {
  selectedIds: string[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [visibility, setVisibility] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleApply() {
    if (!visibility) return;
    setError(null);
    startTransition(async () => {
      const result = await updateCalendarItemsVisibilityAction(
        selectedIds,
        visibility,
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setVisibility("");
      onDone();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 border-b bg-muted/40 px-4 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">
          {selectedIds.length} selected
        </span>
        <Select
          value={visibility}
          onValueChange={(value) => setVisibility(value ?? "")}
        >
          <SelectTrigger size="sm" className="w-48">
            <SelectValue placeholder="Set visibility to…" />
          </SelectTrigger>
          <SelectContent>
            {VISIBILITIES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          disabled={!visibility || isPending}
          onClick={handleApply}
        >
          Apply
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={onDone}
        >
          Clear selection
        </Button>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
