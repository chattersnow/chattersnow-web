"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMyNotificationPreferenceAction } from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";
import type { NotificationKind } from "@/lib/notifications/kinds";

type Result = { error: string } | { success: true };

function PreferenceRow({
  kind,
  enabled,
  onError,
}: {
  kind: NotificationKind;
  enabled: boolean;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const [checked, setChecked] = useOptimistic(enabled);
  const [isPending, startTransition] = useTransition();

  function handleChange(next: boolean) {
    onError(null);

    startTransition(async () => {
      setChecked(next);
      await runAction<Result>(
        () => updateMyNotificationPreferenceAction(kind.key, next),
        {
          success: next ? `${kind.label} are on.` : `${kind.label} are off.`,
          onError,
          onSuccess: () => router.refresh(),
        },
      );
    });
  }

  const labelId = `notification-${kind.key}-label`;

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p id={labelId} className="text-sm font-medium">
          {kind.label}
        </p>
        <p className="app-muted mt-1 text-sm leading-relaxed">
          {kind.description}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        {isPending ? <Spinner className="size-4" /> : null}
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

export function NotificationPreferences({
  kinds,
  enabledByKind,
  orgEmailEnabled,
}: {
  kinds: NotificationKind[];
  /** Only kinds with a saved row appear here. Anything absent is off. */
  enabledByKind: Record<string, boolean>;
  orgEmailEnabled: boolean;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {/* Without this, someone whose toggle is on and whose inbox is empty has
          no way to tell the difference between "nothing was due" and "an
          administrator stopped all email". */}
      {orgEmailEnabled ? null : (
        <Alert>
          <AlertDescription>
            An administrator has turned off all outbound email for this
            organization, so nothing is being sent right now. Your choices below
            are saved and will apply when it is turned back on.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {kinds.map((kind) => (
          <PreferenceRow
            key={kind.key}
            kind={kind}
            enabled={enabledByKind[kind.key] ?? false}
            onError={setError}
          />
        ))}
      </div>
    </div>
  );
}
