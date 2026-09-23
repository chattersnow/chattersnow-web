"use client";

import { toast } from "@/components/ui/toast";
import { NotificationPreferenceList } from "@/components/notification-preferences";
import type { NotificationKind } from "@/lib/notifications/kinds";
import { updateMyNotificationPreferenceAction } from "./actions";

/**
 * The portal's half of the shared switch list (#1165).
 *
 * Everything about how a switch looks and behaves lives in
 * `NotificationPreferenceList`, which `/my` renders too. What this file
 * supplies is what is portal-specific: the Server Action that writes through
 * the portal's own policies, and a toast, because the portal shell mounts a
 * Toaster and a settings panel that saves on toggle otherwise leaves no
 * receipt.
 */
export function NotificationPreferences({
  kinds,
  enabledByKind,
  orgEmailEnabled,
}: {
  kinds: NotificationKind[];
  enabledByKind: Record<string, boolean>;
  orgEmailEnabled: boolean;
}) {
  return (
    <NotificationPreferenceList
      kinds={kinds}
      enabledByKind={enabledByKind}
      orgEmailEnabled={orgEmailEnabled}
      save={updateMyNotificationPreferenceAction}
      listClassName="grid gap-x-8 gap-y-4 space-y-0 xl:grid-cols-2"
      announce={(kind: NotificationKind, enabled: boolean) =>
        toast.success(
          enabled ? `${kind.label} are on.` : `${kind.label} are off.`,
        )
      }
    />
  );
}
