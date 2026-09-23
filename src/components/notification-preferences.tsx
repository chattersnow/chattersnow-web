"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  notificationKindEnabled,
  type NotificationKind,
} from "@/lib/notifications/kinds";

export type SavePreferenceResult = { error: string } | { success: true };

/** Saves one switch. A Server Action, passed in rather than imported. */
export type SavePreference = (
  kind: string,
  enabled: boolean,
) => Promise<SavePreferenceResult>;

function PreferenceRow({
  kind,
  enabled,
  save,
  announce,
  onError,
}: {
  kind: NotificationKind;
  enabled: boolean;
  save: SavePreference;
  announce?: (kind: NotificationKind, enabled: boolean) => void;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const [checked, setChecked] = useOptimistic(enabled);
  const [isPending, startTransition] = useTransition();

  function handleChange(next: boolean) {
    onError(null);

    startTransition(async () => {
      setChecked(next);
      let result: SavePreferenceResult;
      try {
        result = await save(kind.key, next);
      } catch {
        onError("Something went wrong. Please try again.");
        return;
      }
      if ("error" in result) {
        onError(result.error);
        return;
      }
      announce?.(kind, next);
      router.refresh();
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

/**
 * One person's email switches (#488), on either host (#1165).
 *
 * Lifted out of /portal/account so that `/my` renders the same component over
 * the same rows rather than a second editor that has to be kept in step. What
 * differs between the two surfaces is passed in: the Server Action that saves
 * (the portal writes through its own policies, `/my` through a definer RPC,
 * because a constituent has no tenant membership for those policies to
 * resolve), and whether there is anywhere to announce a success -- the portal
 * has a Toaster, the public site does not, so there the inline switch moving
 * is the receipt.
 */
export function NotificationPreferenceList({
  kinds,
  enabledByKind,
  orgEmailEnabled,
  save,
  announce,
  listClassName,
}: {
  kinds: NotificationKind[];
  /**
   * Only kinds with a saved row appear here. A kind that is absent falls back
   * to its own default -- off for the staff queues, on for the receipts a
   * constituent can switch off.
   */
  enabledByKind: Record<string, boolean>;
  /**
   * Whether this tenant is sending any email at all, or null where the reader
   * cannot be told. `/my` passes null: the kill switch lives in `app_settings`,
   * whose select policy admits six `manage` permissions, and widening that to
   * everyone with a website account in order to render one banner would be a
   * poor trade. A staffer sees it on /portal/account, which is where the
   * switch is thrown.
   */
  orgEmailEnabled: boolean | null;
  save: SavePreference;
  announce?: (kind: NotificationKind, enabled: boolean) => void;
  /** Lays out the switches; a wide page can set them two-up. */
  listClassName?: string;
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
      {orgEmailEnabled === false ? (
        <Alert>
          <AlertDescription>
            An administrator has turned off all outbound email for this
            organization, so nothing is being sent right now. Your choices below
            are saved and will apply when it is turned back on.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className={cn("space-y-4", listClassName)}>
        {kinds.map((kind) => (
          <PreferenceRow
            key={kind.key}
            kind={kind}
            enabled={notificationKindEnabled(kind.key, enabledByKind[kind.key])}
            save={save}
            announce={announce}
            onError={setError}
          />
        ))}
      </div>
    </div>
  );
}
