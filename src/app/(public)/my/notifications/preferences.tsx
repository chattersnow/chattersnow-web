"use client";

import { NotificationPreferenceList } from "@/components/notification-preferences";
import type { NotificationKind } from "@/lib/notifications/kinds";
import { setMyNotificationPreferenceAction } from "./actions";

/**
 * The constituent's half of the shared switch list (#1165).
 *
 * No toast: the public site mounts no Toaster, and adding one for a screen
 * that saves on toggle would be a lot of chrome for a receipt the switch
 * already gives. A failure still speaks, through the list's own Alert.
 */
export function MyNotificationPreferences({
  kinds,
  enabledByKind,
}: {
  kinds: NotificationKind[];
  enabledByKind: Record<string, boolean>;
}) {
  return (
    <NotificationPreferenceList
      kinds={kinds}
      enabledByKind={enabledByKind}
      orgEmailEnabled={null}
      save={setMyNotificationPreferenceAction}
    />
  );
}
