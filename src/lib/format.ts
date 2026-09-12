/**
 * How a role is named on screen (#910).
 *
 * `roles.name` is a platform key, not a display string: migrations seed the
 * permission matrix with `join roles r on r.name = '<role>'` across every
 * tenant, so it must stay the same word everywhere. `roles.label` is the
 * tenant's own wording for it, and is null until somebody sets one -- a
 * studio renames "Event coordinator" to "Studio manager" without a migration,
 * while a tenant that never touches it keeps the derived wording and picks up
 * any later change to the platform's default phrasing for free.
 *
 * Two call shapes, because two kinds of surface exist. Screens holding the
 * role row use `roleDisplayName(role)`. Screens holding only names --
 * `my_roles()` and `list_portal_users().roles` return `text[]` of names --
 * pass the map their page already queried: `formatRoleLabel(name, labels)`.
 * Both fall back to the derived wording, so a surface that has no map yet
 * degrades to today's behaviour rather than to a blank.
 */
export type RoleLabels = Record<string, string>;

export type LabeledRole = { name: string; label?: string | null };

export function formatRoleLabel(
  name: string,
  labels?: RoleLabels | null,
): string {
  const label = labels?.[name]?.trim();
  if (label) return label;
  const spaced = name.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The display name for a role row that carries its own label. */
export function roleDisplayName(role: LabeledRole): string {
  return role.label?.trim() || formatRoleLabel(role.name);
}

/** A name -> label lookup for the surfaces that only receive role names. */
export function roleLabelMap(roles: readonly LabeledRole[]): RoleLabels {
  const map: RoleLabels = {};
  for (const role of roles) {
    const label = role.label?.trim();
    if (label) map[role.name] = label;
  }
  return map;
}

export type DisplayNamePerson = {
  preferred_name?: string | null;
  name?: string | null;
  email?: string | null;
};

export type DisplayNameActor = {
  full_name?: string | null;
  email?: string | null;
};

/**
 * The one display rule for a person anywhere in the portal:
 * preferred_name -> name -> email -> fallback.
 *
 * Uses `||` rather than `??` on purpose. `??` only guards null/undefined, so
 * an empty-string preferred_name -- a cleared input that reached the database
 * as "" rather than null, or a provider that supplied full_name: "" -- would
 * render as blank text. `||` skips it.
 *
 * Fields are optional so a surface whose query hasn't been widened to select
 * preferred_name degrades to the legal name rather than to the fallback.
 */
export function personDisplayName(
  person: DisplayNamePerson | null | undefined,
  fallback = "—",
): string {
  if (!person) return fallback;
  return (
    person.preferred_name?.trim() ||
    person.name?.trim() ||
    person.email?.trim() ||
    fallback
  );
}

/**
 * The same rule for an auth actor (an audit stamp such as submitted_by or
 * status_changed_by), where the only name available is auth metadata. Pass a
 * fallback where a more debuggable one exists than "—" -- e.g. the actor's
 * user id on the expense detail view.
 */
export function actorDisplayName(
  actor: DisplayNameActor | null | undefined,
  fallback = "—",
): string {
  if (!actor) return fallback;
  return actor.full_name?.trim() || actor.email?.trim() || fallback;
}

/*
 * Dates and money.
 *
 * Two kinds of date value reach the UI and they must not share a formatter:
 *
 * - A Postgres `date` column arrives as "YYYY-MM-DD". `new Date()` parses
 *   that as UTC midnight, so it has to be formatted pinned to UTC or every
 *   viewer west of Greenwich sees the previous day. Use `formatCalendarDate`.
 * - A `timestamptz` column arrives as an ISO instant and should be shown in
 *   the viewer's own zone. Use `formatInstantDate` (day only) or
 *   `formatDateTime` (day and time).
 *
 * Picking the wrong one is invisible in a UTC development environment and
 * off by a day for every real user, which is why the choice is named here
 * rather than left to an options object at each call site. For an event's
 * own timezone see `formatDateTimeInZone` in `src/lib/time.ts`.
 */

const calendarDate = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});
const instantDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
const instantDateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const plainNumber = new Intl.NumberFormat("en-US");

export type DateInput = string | Date | null | undefined;
export type NumberInput = number | string | null | undefined;

export const EMPTY_VALUE = "—";

function toDate(value: DateInput): Date | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toNumber(value: NumberInput): number | null {
  if (value == null || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

/** A `date` column ("2026-03-14") as "Mar 14, 2026", never shifted by zone. */
export function formatCalendarDate(
  value: DateInput,
  fallback = EMPTY_VALUE,
): string {
  const date = toDate(value);
  return date ? calendarDate.format(date) : fallback;
}

/** A `timestamptz` instant as the viewer's local day, "Mar 14, 2026". */
export function formatInstantDate(
  value: DateInput,
  fallback = EMPTY_VALUE,
): string {
  const date = toDate(value);
  return date ? instantDate.format(date) : fallback;
}

/** A `timestamptz` instant as the viewer's local day and time. */
export function formatDateTime(
  value: DateInput,
  fallback = EMPTY_VALUE,
): string {
  const date = toDate(value);
  return date ? instantDateTime.format(date) : fallback;
}

/** An amount in US dollars, "$1,234.50". Accepts numeric strings from forms. */
export function formatCurrency(
  value: NumberInput,
  fallback = EMPTY_VALUE,
): string {
  const numeric = toNumber(value);
  return numeric === null ? fallback : usd.format(numeric);
}

/** A count or quantity with thousands separators, "1,234". */
export function formatNumber(
  value: NumberInput,
  fallback = EMPTY_VALUE,
): string {
  const numeric = toNumber(value);
  return numeric === null ? fallback : plainNumber.format(numeric);
}
