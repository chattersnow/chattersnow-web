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
   * Who the switch is for (#1165).
   *
   * `staff` is the portal audience this registry was written for: somebody who
   * holds a role and owns a queue. `constituent` is a person acting as
   * themselves on the public site, who may also be a staffer -- there is one
   * identity across both hosts (#1160), so an administrator sees their own
   * event confirmations alongside the queues they run.
   *
   * `/my` renders only the `constituent` entries. /portal/account renders
   * everything the reader is eligible for, staff and constituent alike,
   * because a staffer registering for their own organization's event is a
   * constituent too and has only one account to say so with.
   */
  audience?: "staff" | "constituent";
  /**
   * What a person gets before they have ever touched the switch.
   *
   * False for every staff kind, and that is the invariant `person_claim` and
   * the digest rely on: no row means no email, so nothing is ever sent to
   * somebody who did not ask for it.
   *
   * True for a constituent kind, because those are receipts. "You are
   * registered" answers something the person did thirty seconds ago, and
   * withholding it until they find a preference screen would be a worse
   * default than any inbox it saves. They are therefore opt-*out*: an explicit
   * `enabled = false` row is what stops them, which is also the record that
   * the opt-out was honoured.
   */
  defaultEnabled?: boolean;
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
    audience: "staff",
    label: "Daily task reminders",
    description:
      "A morning summary of the meeting action items assigned to you that are overdue or due within a week.",
  },
  {
    key: "volunteer_application",
    audience: "staff",
    label: "New volunteer applications",
    description:
      "An email as soon as someone applies to volunteer, linking straight to their application.",
    requires: { resources: ["volunteers"], level: "manage" },
  },
  {
    key: "contact_message",
    audience: "staff",
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
    audience: "staff",
    label: "New artwork submissions",
    description:
      "An email as soon as someone submits artwork to an open call, linking straight to the review queue.",
    requires: { resources: ["artwork_submissions"], level: "manage" },
  },
  {
    key: "gear_request",
    audience: "staff",
    label: "New gear requests",
    description:
      "An email as soon as someone requests items from the public library, linking straight to the request.",
    // The inventory managers own the request queue. inventory_intake:manage
    // deliberately does not qualify: an intake volunteer records what comes
    // in, and has no view of what is being asked for.
    requires: { resources: ["inventory"], level: "manage" },
  },
  {
    key: "person_claim",
    audience: "staff",
    label: "Account claims",
    description:
      "An email when somebody with a website account asks to be linked to their record, and a note to them when it is decided.",
    // Its own resource rather than `people`, because deciding who may read a
    // person's giving history is a different question from who may correct
    // their phone number. It belongs to the constituent_accounts module, so on
    // a tenant without the constituent area has_permission() is false for
    // everyone and this switch can never produce a message -- the same reason
    // every other entry names the permission its sender checks.
    requires: { resources: ["constituent_claims"], level: "manage" },
  },
  {
    key: "gear_request_confirmation",
    audience: "constituent",
    defaultEnabled: true,
    label: "Gear request updates",
    description:
      "Confirmation that we have your request for items from the library, and what happens next.",
  },
  {
    key: "event_registration_confirmation",
    audience: "constituent",
    defaultEnabled: true,
    label: "Event registration confirmations",
    description:
      "Your place at an event, with the date, the time and where to be, as soon as you sign up.",
  },
  {
    key: "volunteer_application_confirmation",
    audience: "constituent",
    defaultEnabled: true,
    label: "Volunteer application updates",
    description:
      "Confirmation that your application to volunteer arrived, with the reference that tracks it.",
  },
];

/**
 * The three receipts a person gets for something they did themselves.
 *
 * They were written (#1032, #1068, #1069) as kinds nobody could switch,
 * deliberately and correctly: each is addressed to whoever filled in a public
 * form, and until #1160 that person held no account, so no preference row and
 * no screen to set one on. A switch on /portal/account could not have changed
 * what any of them received.
 *
 * #1160 is what changed. A constituent now has an account, and `/my` is a
 * screen where a preference means something -- so these three join the
 * registry as the kinds that audience actually holds. What does not change is
 * anyone without an account: they have no row, no row means the default, and
 * the default for a receipt is on. The only person a `false` here can silence
 * is the one who set it.
 *
 * The constants stay exported: the senders and the delivery ledger have to
 * agree on the spelling, and every other reference is by key.
 *
 * `volunteer_application_confirmation` is *not* the `volunteer_application`
 * kind above. That one is the staff notice and is unchanged.
 */
export const GEAR_REQUEST_CONFIRMATION_KIND = "gear_request_confirmation";

export const EVENT_REGISTRATION_CONFIRMATION_KIND =
  "event_registration_confirmation";

export const VOLUNTEER_APPLICATION_CONFIRMATION_KIND =
  "volunteer_application_confirmation";

/**
 * The switches `/my` offers (#1165). A constituent must not be shown a staff
 * kind: a volunteer with no role would get a "New volunteer applications"
 * toggle that can never produce a message however it is set.
 */
export const CONSTITUENT_NOTIFICATION_KINDS: NotificationKind[] =
  NOTIFICATION_KINDS.filter((kind) => kind.audience === "constituent");

/**
 * What this kind means for somebody with no row, which is most people.
 *
 * The one place the opt-in/opt-out split is written down, so a sender and a
 * screen cannot disagree about which way an absent row falls.
 */
export function notificationKindDefault(key: string): boolean {
  return (
    NOTIFICATION_KINDS.find((kind) => kind.key === key)?.defaultEnabled ?? false
  );
}

/**
 * Whether a saved row (or its absence) means this person gets this kind.
 */
export function notificationKindEnabled(
  key: string,
  saved: boolean | undefined,
): boolean {
  return saved ?? notificationKindDefault(key);
}

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
