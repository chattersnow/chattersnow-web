/**
 * Who is working each ops-inbox queue item (#1644, #1668).
 *
 * Every queue table carries the same `claimed_by_person_id` / `claimed_at`
 * pair, written only through `set_queue_item_claim()`. A claim survives the
 * item's intermediate states and clears on resolution; the clear is written
 * into each resolution path, and `RESOLVED_STATUSES` is the list those paths
 * and the RPC agree on. See supabase/migrations/20261022120000_queue_claims.sql
 * and docs/technical-spec.md §5.10.
 */

export const QUEUE_KEYS = [
  "gear_requests",
  "person_claims",
  "volunteer_hours",
  "volunteer_applications",
  "contact_messages",
  "artwork_submissions",
] as const;
export type QueueKey = (typeof QUEUE_KEYS)[number];

export function isQueueKey(value: string): value is QueueKey {
  return (QUEUE_KEYS as readonly string[]).includes(value);
}

/**
 * The statuses that resolve an item, and so clear its claim. Mirrors the CASE
 * in `set_queue_item_claim()`, which refuses a claim on any of them.
 */
export const RESOLVED_STATUSES: Record<QueueKey, readonly string[]> = {
  gear_requests: ["fulfilled", "cancelled"],
  person_claims: ["approved", "rejected", "withdrawn"],
  volunteer_hours: ["confirmed", "declined"],
  volunteer_applications: ["placed", "declined", "closed"],
  contact_messages: ["resolved"],
  artwork_submissions: ["approved", "rejected"],
};

export function isResolvedStatus(queue: QueueKey, status: string): boolean {
  return RESOLVED_STATUSES[queue].includes(status);
}

/**
 * The columns to write beside a status change made with a plain update, so a
 * resolution clears the claim in the same statement. Empty for a status that
 * keeps it.
 */
export function claimClearFor(
  queue: QueueKey,
  status: string,
): { claimed_by_person_id: null; claimed_at: null } | Record<string, never> {
  return isResolvedStatus(queue, status)
    ? { claimed_by_person_id: null, claimed_at: null }
    : {};
}

/**
 * The claim FK's name per queue, for a `people!<fk>(...)` embed. The claim
 * column is a second relationship to `people` on most of these tables, so a
 * bare `people(...)` embed is ambiguous to PostgREST (PGRST201).
 */
export const CLAIM_FK: Record<QueueKey, string> = {
  gear_requests: "gear_requests_claimed_by_in_tenant",
  person_claims: "person_claims_claimed_by_in_tenant",
  volunteer_hours: "volunteer_hour_submissions_claimed_by_in_tenant",
  volunteer_applications: "volunteer_applications_claimed_by_in_tenant",
  contact_messages: "contact_messages_claimed_by_in_tenant",
  artwork_submissions: "artwork_submissions_claimed_by_in_tenant",
};

/** The list filter, carried in the URL as `claimed=none|mine|<person id>`. */
export type ClaimFilter =
  | { kind: "all" }
  | { kind: "none" }
  | { kind: "mine" }
  | { kind: "person"; personId: string };

export const CLAIM_FILTER_PARAM = "claimed";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseClaimFilter(
  raw: string | string[] | undefined,
): ClaimFilter {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "none") return { kind: "none" };
  if (value === "mine") return { kind: "mine" };
  if (value && UUID_PATTERN.test(value)) {
    return { kind: "person", personId: value.toLowerCase() };
  }
  return { kind: "all" };
}

export function claimFilterValue(filter: ClaimFilter): string {
  switch (filter.kind) {
    case "all":
      return "all";
    case "none":
      return "none";
    case "mine":
      return "mine";
    case "person":
      return filter.personId;
  }
}

/**
 * The person id to filter on, `null` for "unclaimed", or `undefined` for no
 * filter at all. "Mine" for a caller with no person record matches nothing,
 * which is the honest answer: nothing can be claimed by them.
 */
export function claimFilterTarget(
  filter: ClaimFilter,
  myPersonId: string | null,
): string | null | undefined {
  switch (filter.kind) {
    case "all":
      return undefined;
    case "none":
      return null;
    case "mine":
      return myPersonId ?? "00000000-0000-0000-0000-000000000000";
    case "person":
      return filter.personId;
  }
}

/** Narrows a PostgREST query by the claim filter. */
export function applyClaimFilter<
  Q extends {
    is(column: string, value: null): Q;
    eq(column: string, value: string): Q;
  },
>(query: Q, filter: ClaimFilter, myPersonId: string | null): Q {
  const target = claimFilterTarget(filter, myPersonId);
  if (target === undefined) return query;
  if (target === null) return query.is("claimed_by_person_id", null);
  return query.eq("claimed_by_person_id", target);
}

/**
 * The same filter applied to rows already in hand, for a list that filters
 * client-side (Messages). Agrees with `applyClaimFilter` row for row.
 */
export function matchesClaimFilter(
  claimantId: string | null,
  filter: ClaimFilter,
  myPersonId: string | null,
): boolean {
  const target = claimFilterTarget(filter, myPersonId);
  if (target === undefined) return true;
  return claimantId === target;
}

/**
 * "New item requests (2 unclaimed)". No suffix when nothing is claimed:
 * "5 (5 unclaimed)" says the same thing twice. "(0 unclaimed)" stays, since
 * that everything has somebody on it is worth saying.
 */
export function withUnclaimedSuffix(
  label: string,
  total: number,
  unclaimed: number,
): string {
  if (unclaimed >= total) return label;
  return `${label} (${unclaimed} unclaimed)`;
}

/**
 * Adds `claimed=none` to a deep link only when some items are claimed:
 * otherwise the plain link already shows exactly the unclaimed ones.
 */
export function withUnclaimedFilter(
  href: string,
  total: number,
  unclaimed: number,
): string {
  if (unclaimed >= total) return href;
  return `${href}${href.includes("?") ? "&" : "?"}${CLAIM_FILTER_PARAM}=none`;
}

/** Why Claim is unavailable to a caller with no person record to claim as. */
export const NO_PERSON_RECORD_MESSAGE =
  "You need a person record in this organization to claim items.";
