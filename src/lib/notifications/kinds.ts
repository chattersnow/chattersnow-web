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
  /**
   * The portal permission a person must hold for this kind to mean anything:
   * `level` on any one of `resources`.
   *
   * The senders check it themselves -- people_with_permission() (#742) is what
   * actually decides who gets mail -- but /portal/account has to know too, or
   * a volunteer account grows a "New volunteer applications" switch that can
   * never produce a message however it is set. Keep the two in step: this is
   * the same (resources, level) pair the matching sender passes.
   *
   * Absent means everyone, which is right for the digest: it is addressed to
   * whoever owns the action item, not to a role.
   */
  requires?: { resources: string[]; level: "view" | "manage" };
};

export const NOTIFICATION_KINDS: NotificationKind[] = [
  {
    key: "task_digest",
    label: "Daily task reminders",
    description:
      "A morning summary of the meeting action items assigned to you that are overdue or due within a week.",
  },
  {
    key: "volunteer_application",
    label: "New volunteer applications",
    description:
      "An email as soon as someone applies to volunteer, linking straight to their application.",
    requires: { resources: ["volunteers"], level: "manage" },
  },
  {
    key: "contact_message",
    label: "New contact messages",
    description:
      "An email as soon as someone writes in through the public contact form, linking straight to the message.",
    // The ops inbox is owned by communications, with administration as the
    // standing fallback -- the same union the sender resolves.
    requires: {
      resources: ["communications", "administration"],
      level: "manage",
    },
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
