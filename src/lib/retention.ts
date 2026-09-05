/**
 * The published retention periods, in one place.
 *
 * These are a board decision, recorded in the planning repo at
 * `decisions/2026-09-02-personal-data-retention-and-privacy-policy.md`. Change
 * them there first, then here, then in the `retention_policies` seed
 * (`supabase/migrations/20260905090000_create_retention_policies.sql`).
 *
 * This module is the single in-repo transcription of that decision. The public
 * privacy page renders `RETENTION` from it, and the purge reads its periods
 * from the `retention_policies` table -- an integration test asserts the two
 * agree, so the page cannot promise one clock while the job enforces another.
 * That test is the whole reason `period` is duplicated here rather than left to
 * the database: prose and enforcement drifting apart is exactly the failure
 * this ticket exists to fix.
 *
 * `period` is a Postgres interval literal so the comparison is string equality
 * against the seeded column, with no parsing on either side.
 */
export type RetentionPolicy = {
  /** Primary key in `public.retention_policies`. */
  key: string;
  /** The category, as the published page names it. */
  what: string;
  /** The published prose. Written for a visitor, not for an engineer. */
  howLong: string;
  /** Postgres interval literal, matching `retention_policies.period`. */
  period: string;
  /** Matching `retention_policies.secondary_period`; only one policy has one. */
  secondaryPeriod?: string;
};

export const RETENTION_POLICIES: readonly RetentionPolicy[] = [
  {
    key: "contact_messages",
    what: "Contact form messages",
    howLong: "2 years from the date you sent them.",
    period: "2 years",
  },
  {
    key: "volunteer_applications",
    what: "Volunteer applications",
    // 2 years, not 3: there is little operational reason to hold an
    // application we did not act on for three seasons, and the shorter
    // clock still covers a volunteer's history across two winters.
    //
    // The status check constraint has no 'withdrawn' value -- 'declined' and
    // 'closed' are the states that mean it, and the purge branches on those.
    howLong:
      "2 years after your last activity with us, or 1 year if the application is withdrawn or declined.",
    period: "2 years",
    secondaryPeriod: "1 year",
  },
  {
    key: "event_registrations",
    what: "Event registrations",
    // The registration row survives with its personal fields stripped rather
    // than being deleted: attendance counts, first-time-rider counts and
    // discipline splits feed impact and grant reporting, and deleting the rows
    // would restate figures already filed with funders.
    howLong: "3 years after the event.",
    period: "3 years",
  },
  {
    key: "rider_profiles",
    // Split out from event registrations: a rider profile is standing
    // information about a person, not a record of one event, so tying its
    // clock to an event they happened to attend is the wrong shape.
    what: "Rider profiles",
    howLong:
      "Until you ask us to delete your profile, or after 2 years of inactivity.",
    period: "2 years",
  },
  {
    key: "gear_requests",
    what: "Gear requests",
    // Was "3 years after the gear comes back", which describes a lending
    // program Chatter does not run: donated gear is given away and never
    // returned (inventory_movements has 'distributed' and no 'returned'), so
    // the clock never started. Same 3 years, from an event that happens.
    howLong: "3 years after we hand the gear over.",
    period: "3 years",
  },
  {
    key: "portal_accounts",
    // Reworded for #602. This used to say the account "is removed", which the
    // system cannot do and was never going to: audit_log.actor_id and ~120
    // other created_by/updated_by columns reference auth.users with no ON
    // DELETE, so deleting the identity of anyone who has ever written a row
    // fails outright. What actually happens is that access is permanently
    // disabled and the personal details on the portal record are cleared. The
    // sign-in identity itself is retained as part of the audit trail, and the
    // sentence below no longer implies otherwise.
    what: "Portal accounts",
    howLong:
      "For as long as you hold the role. When your role ends we permanently disable your access and clear the personal details we hold about you in the portal. We keep the record of what was done through the portal — including which account did it — for governance, security, audit, insurance, and legal reasons.",
    period: "3 months",
  },
];

/** What the privacy page renders. */
export const RETENTION = RETENTION_POLICIES.map(({ what, howLong }) => ({
  what,
  howLong,
}));
