/**
 * The kinds of outbound email a person can turn on for themselves (#488), and
 * the key of the org-wide switch that overrides all of them.
 *
 * A registry rather than a database enum, for the same reason PUBLIC_PAGE_SLOTS
 * in src/lib/page-visibility.ts is one: adding a kind should be a line here and
 * a sender that reads it, not a migration. #742 (volunteer applications,
 * contact messages) and #743 (the leadership ops report) add entries.
 *
 * Zero runtime imports on purpose, so the client-side preference and admin
 * panels can import it directly without dragging a Supabase client into the
 * browser bundle -- the same shape as src/lib/fiscal-year.ts.
 */

export type NotificationKind = {
  key: string;
  label: string;
  description: string;
};

export const NOTIFICATION_KINDS: NotificationKind[] = [
  {
    key: "task_digest",
    label: "Daily task reminders",
    description:
      "A morning summary of the meeting action items assigned to you that are overdue or due within a week.",
  },
];

export function isNotificationKind(key: string): boolean {
  return NOTIFICATION_KINDS.some((kind) => kind.key === key);
}

/**
 * The org-wide kill switch, as an app_settings key. Off means this tenant sends
 * nothing of any kind -- including the follow-up tickets' sends -- regardless of
 * what any individual has turned on.
 */
export const EMAIL_ENABLED_SETTING_KEY = "notifications.email_enabled";

/**
 * What an unset switch means. On: the switch is something an administrator
 * turns *off* in an emergency, and the per-person opt-in is what actually
 * decides whether any given message goes out.
 */
export const EMAIL_ENABLED_DEFAULT = true;
