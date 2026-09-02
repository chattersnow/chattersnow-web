"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updatePageVisibilityAction,
  type SettingActionResult,
} from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
// Type-only: @/lib/page-visibility also exports server helpers that pull in
// createSupabaseServerClient, which must not reach the client bundle. The slot
// list arrives as a prop from the server page, same as SiteImagesPanel.
import type { PublicPageSlot } from "@/lib/page-visibility";

function PageVisibilityRow({
  slot,
  visible,
  onError,
}: {
  slot: PublicPageSlot;
  visible: boolean;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  // Mirrors the switch immediately so the toggle doesn't feel stuck while the
  // Server Action round-trips. `useOptimistic` rather than plain state on
  // purpose: it drops back to the server's own value the moment the transition
  // ends, so the switch can never keep showing a change the server didn't
  // actually make. Plain state kept the optimistic value forever, which is how
  // a read that was failing server-side still looked like a successful save --
  // right up until a later navigation remounted the row and it "reverted".
  const [checked, setChecked] = useOptimistic(visible);
  const [isPending, startTransition] = useTransition();

  function handleChange(next: boolean) {
    onError(null);

    startTransition(async () => {
      setChecked(next);
      const result: SettingActionResult = await updatePageVisibilityAction(
        slot.key,
        next,
      );
      if ("error" in result) {
        onError(result.error);
        return;
      }
      // Keeps the transition open until the server tree is refetched, so the
      // optimistic value hands off directly to the re-read one.
      router.refresh();
    });
  }

  const labelId = `page-visibility-${slot.key}-label`;

  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="min-w-0">
        <p id={labelId} className="text-sm font-medium">
          {slot.label}
        </p>
        <p className="app-muted mt-1 text-sm leading-relaxed">
          {slot.description}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        {isPending ? <Spinner className="size-4" /> : null}
        <span className="app-muted w-14 text-right text-xs">
          {checked ? "Visible" : "Hidden"}
        </span>
        <Switch
          checked={checked}
          onCheckedChange={handleChange}
          disabled={isPending}
          aria-labelledby={labelId}
        />
      </div>
    </div>
  );
}

export function PageVisibilityPanel({
  slots,
  visibility,
}: {
  slots: PublicPageSlot[];
  visibility: Record<string, boolean>;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardContent className="divide-y divide-[var(--line)]">
          {slots.map((slot) => (
            <PageVisibilityRow
              key={slot.key}
              slot={slot}
              visible={visibility[slot.key] ?? slot.defaultVisible}
              onError={setError}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
