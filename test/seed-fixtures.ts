/**
 * Ids of the records `supabase/seed.sql` hand-authors, written out rather than
 * generated (#665).
 *
 * The bulk seed data draws from a fixed PRNG seed, so a reset reproduces the
 * same rows -- but `gen_random_uuid()` draws from pgcrypto's CSPRNG, which
 * `setseed()` does not reach. Ids are therefore only stable for the records the
 * seed writes literally, which is this list: the accounts, and the named
 * fixtures tests and the a11y scan assert on.
 *
 * These mirror the literals in `supabase/seed.sql` -- change one, change both.
 * Everything else in the database still gets a fresh id per reset, so keep
 * matching bulk rows by natural key (name, email, search param) the way the
 * specs already do.
 */

/**
 * The 8 seeded accounts. Their emails and shared password live with the
 * helpers that sign in -- `SEEDED_USERS` in `test/integration-setup.ts` and
 * `SEEDED_PASSWORD` in `e2e/helpers/auth.ts` -- not here.
 */
export const SEEDED_USER_IDS = {
  admin: "aaaaaaaa-0000-4000-8000-000000000001",
  coordinator: "aaaaaaaa-0000-4000-8000-000000000002",
  finance: "aaaaaaaa-0000-4000-8000-000000000003",
  board: "aaaaaaaa-0000-4000-8000-000000000004",
  volunteer: "aaaaaaaa-0000-4000-8000-000000000005",
  multi: "aaaaaaaa-0000-4000-8000-000000000006",
  noAccess: "aaaaaaaa-0000-4000-8000-000000000007",
  former: "aaaaaaaa-0000-4000-8000-000000000008",
} as const;

/** Named people. `sponsor` is the org; the rest are individuals. */
export const SEEDED_PERSON_IDS = {
  /** Jamie Rivera -- donor, the $100 check on the donations list. */
  donor1: "bbbbbbbb-0000-4000-8000-000000000001",
  /** Alex Chen -- donor. */
  donor2: "bbbbbbbb-0000-4000-8000-000000000002",
  /** Summit Outdoor Co. -- sponsor org, board member, won partnership. */
  sponsor: "bbbbbbbb-0000-4000-8000-000000000003",
  /** Priya Natarajan -- volunteer and event lead. */
  volunteer: "bbbbbbbb-0000-4000-8000-000000000004",
  /** Local Roasters Coffee -- donor org, prospecting partnership. */
  localRoasters: "bbbbbbbb-0000-4000-8000-000000000005",
} as const;

/**
 * The three hand-authored events: one public/published/upcoming, one
 * public/published/past with attendance, one private/draft.
 */
export const SEEDED_EVENT_IDS = {
  /** "Winter Gear Swap" -- public, published, ~21 days out. */
  upcoming: "cccccccc-0000-4000-8000-000000000001",
  /** "Fall Trailhead Cleanup & Giveaway" -- public, published, ~40 days ago. */
  past: "cccccccc-0000-4000-8000-000000000002",
  /** "Spring Board Planning Session" -- private, draft. */
  draft: "cccccccc-0000-4000-8000-000000000003",
} as const;

export const SEEDED_DONATION_IDS = {
  /** Jamie Rivera's, tied to the upcoming event, two items. */
  withEvent: "dddddddd-0000-4000-8000-000000000001",
  /** Alex Chen's, untied, three items. */
  untied: "dddddddd-0000-4000-8000-000000000002",
} as const;

export const SEEDED_INVENTORY_IDS = {
  jacket: "eeeeeeee-0000-4000-8000-000000000001",
  boots: "eeeeeeee-0000-4000-8000-000000000002",
  pullover: "eeeeeeee-0000-4000-8000-000000000003",
  snowPants: "eeeeeeee-0000-4000-8000-000000000004",
  beanie: "eeeeeeee-0000-4000-8000-000000000005",
  /** The one distributed movement, which /portal/inventory/distribution lists. */
  distributedMovement: "eeeeeeee-0000-4000-8000-000000001001",
} as const;

export const SEEDED_CALENDAR_IDS = {
  /** "Winter Gear Swap Promotion" -- carries the content opportunity. */
  promotion: "ffffffff-0000-4000-8000-000000000001",
  /** "Sample Recurring Observance" -- dated to today, drives the generate flow. */
  recurring: "ffffffff-0000-4000-8000-000000000002",
  /** The series the recurring item belongs to. */
  recurringSeriesKey: "ffffffff-0000-4000-8000-000000002001",
} as const;

export const SEEDED_GOVERNANCE_IDS = {
  /** Completed board meeting, ~14 days ago, with agenda and action items. */
  meeting: "abababab-0000-4000-8000-000000000001",
} as const;

export const SEEDED_PROGRAM_IDS = {
  /** "Winter Access Program". */
  winterAccess: "babababa-0000-4000-8000-000000000001",
} as const;

export const SEEDED_GIVEAWAY_IDS = {
  /** "Trailhead Cleanup Giveaway" on the past event. */
  trailheadCleanup: "babababa-0000-4000-8000-000000000002",
} as const;
