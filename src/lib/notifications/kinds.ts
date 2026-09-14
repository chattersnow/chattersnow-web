/**
 * The kinds of outbound email a person can turn on for themselves (#488), and
 * the key of the org-wide switch that overrides all of them.
 *
 * A registry rather than a database enum, for the same reason PUBLIC_PAGE_SLOTS
 * in src/lib/page-visibility.ts is one: adding a kind should be a line here and
 * a sender that reads it, not a migration. #742 (volunteer applications,
 * contact messages) added entries.
 *
 * The leadership ops report (#743) deliberately has none. It is addressed to a
 * shared inbox configured in app_settings, not to a `people` row, so there is
 * nobody to hold a preference -- and listing it here would grow a switch on
 * /portal/account that could never change what anyone receives. Its own
 * registration is OPS_REPORT_RECIPIENTS_SETTING_KEY in
 * src/lib/notifications/ops-report.ts; the kill switch below still governs it.
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
  {
    key: "artwork_submission",
    label: "New artwork submissions",
    description:
      "An email as soon as someone submits artwork to an open call, linking straight to the review queue.",
    requires: { resources: ["artwork_submissions"], level: "manage" },
  },
  {
    key: "gear_request",
    label: "New gear requests",
    description:
      "An email as soon as someone requests items from the public library, linking straight to the request.",
    // The inventory managers own the request queue. inventory_intake:manage
    // deliberately does not qualify: an intake volunteer records what comes
    // in, and has no view of what is being asked for.
    requires: { resources: ["inventory"], level: "manage" },
  },
];

/**
 * The requester's own confirmation (#1032) is not a kind anyone in the
 * portal can switch: it is addressed to the person who asked, who holds no
 * account and no preference row -- the same reasoning as the ops report. Its
 * key is here only so the ledger and the sender agree on the spelling; the
 * kill switch below still governs it.
 */
export const GEAR_REQUEST_CONFIRMATION_KIND = "gear_request_confirmation";

/**
 * The registrant's own confirmation (#1068), on the same footing as the gear
 * one above: it is addressed to whoever signed up for a public event, who holds
 * no portal account and therefore no preference row. Listing it in the registry
 * would grow a switch on /portal/account that could never change what anyone
 * receives. Its key is here only so the ledger and the sender agree on the
 * spelling; the kill switch below still governs it.
 */
export const EVENT_REGISTRATION_CONFIRMATION_KIND =
  "event_registration_confirmation";

/**
 * The applicant's own confirmation (#1069), carrying the reference code that
 * is the only key to the public status page. Outside the registry for the same
 * reason as the two above: the applicant holds no portal account and so no
 * preference row, and a switch on /portal/account could never change what they
 * receive. Note this is *not* the `volunteer_application` kind in the registry
 * above -- that one is the staff notice, and it stays exactly as it is. The
 * kill switch governs both.
 */
export const VOLUNTEER_APPLICATION_CONFIRMATION_KIND =
  "volunteer_application_confirmation";

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
