import type { SupabaseClient } from "@supabase/supabase-js";
import {
  checkAnyPermission,
  hasPermission,
  type PermissionCheck,
  type PermissionDenied,
  type PermissionLevel,
  type PermissionMap,
} from "@/lib/auth/permissions";

/**
 * Per-event access for guests (#1685): an account with no tenant role that
 * holds `event_access_grants` rows. The grants and their checks are the
 * database's (#1686, #1687); this module is how the portal reads them.
 */

/** `event_access_areas.key`, the platform's list (#1686). */
export const EVENT_ACCESS_AREAS = [
  "details",
  "staff",
  "registrations",
  "media",
  "impact",
  "expenses",
  "revenue",
  "sponsors",
  "goods",
  "incidents",
] as const;

export type EventAccessArea = (typeof EVENT_ACCESS_AREAS)[number];

/** One `event_access_areas` row, with whether this tenant offers it now. */
export type EventAccessAreaOption = {
  key: EventAccessArea;
  label: string;
  description: string;
  sensitive: boolean;
  offered: boolean;
};

/**
 * The platform's areas in catalog order, each marked offered or not by the
 * current tenant (#1689). Null when the catalog cannot be read.
 */
export async function getEventAccessAreaOptions(
  supabase: SupabaseClient,
): Promise<EventAccessAreaOption[] | null> {
  const [{ data: areas, error }, { data: offered }] = await Promise.all([
    supabase
      .from("event_access_areas")
      .select("key, label, description, sensitive")
      .order("sort_order"),
    supabase.rpc("event_access_offered_areas"),
  ]);
  if (error || !areas) return null;
  const offeredKeys = new Set((offered ?? []) as string[]);
  return areas.map((area) => ({
    key: area.key as EventAccessArea,
    label: area.label as string,
    description: area.description as string,
    sensitive: area.sensitive as boolean,
    offered: offeredKeys.has(area.key as string),
  }));
}

/** One row of `my_granted_events()`: only the areas the tenant offers now. */
export type EventGrant = {
  event_id: string;
  level: Exclude<PermissionLevel, "none">;
  areas: EventAccessArea[];
};

const grantsByClient = new WeakMap<SupabaseClient, Promise<EventGrant[]>>();

/**
 * The caller's grants in the current tenant. Memoized per client for the same
 * reason as `getCurrentUserPermissions`: the layout, the events layout, the
 * page and its actions all ask within one request.
 *
 * A failed read is no grants, which for a guest means "no access" -- the same
 * answer a failed `my_permissions()` gives a role holder.
 */
export function getMyGrantedEvents(
  supabase: SupabaseClient,
): Promise<EventGrant[]> {
  const cached = grantsByClient.get(supabase);
  if (cached) return cached;
  const pending = (async () => {
    const { data } = await supabase.rpc("my_granted_events");
    return (data ?? []) as EventGrant[];
  })();
  grantsByClient.set(supabase, pending);
  return pending;
}

/** No tenant role at all: every resource is `none`. */
export function hasNoRole(permissions: PermissionMap): boolean {
  return !Object.values(permissions).some((level) => level !== "none");
}

/**
 * A guest: no tenant role, at least one grant. Sees only Events, and only
 * their granted events in it. Someone with a role and a grant is not a guest:
 * the role already gives them the portal, and the grant only widens the
 * events it names (#1687's policies take the greater of the two).
 */
export async function isEventGuest(
  supabase: SupabaseClient,
  permissions: PermissionMap,
): Promise<boolean> {
  if (!hasNoRole(permissions)) return false;
  return (await getMyGrantedEvents(supabase)).length > 0;
}

/** The caller's grant on one event, or null. */
export async function getMyEventGrant(
  supabase: SupabaseClient,
  eventId: string,
): Promise<EventGrant | null> {
  const grants = await getMyGrantedEvents(supabase);
  return grants.find((grant) => grant.event_id === eventId) ?? null;
}

const LEVEL_RANK = { view: 1, manage: 2 } as const;

/**
 * Whether a page may show (or edit) one area of one event: `events` at
 * `level`, or `grant` covering `area` at that level. For pages; a Server
 * Action asks the database through `checkEventAccess`.
 */
export function reachesEventArea(
  permissions: PermissionMap,
  grant: EventGrant | null,
  area: EventAccessArea,
  level: Exclude<PermissionLevel, "none">,
): boolean {
  if (hasPermission(permissions, "events", level)) return true;
  return (
    grant !== null &&
    grant.areas.includes(area) &&
    LEVEL_RANK[grant.level] >= LEVEL_RANK[level]
  );
}

export type EventAccessCheck = {
  /** An `event_access_area_tables.table_name`: what the action touches. */
  table: string;
  level: Exclude<PermissionLevel, "none">;
  /**
   * The event, when the action knows it. Without one -- an action handed only
   * a row id -- a grant on any event passes here and the table's RLS, which
   * #1687 gave a grant arm per event, decides the row.
   */
  eventId?: string | null;
  /** The role check this action has always made. Default `events` at `level`. */
  role?: readonly PermissionCheck[];
};

/**
 * Server Action guard for an event page (#1688): the action's role check, or a
 * grant reaching `table` at `level` (`has_event_access()` for one event,
 * `has_any_event_access()` otherwise). The role check runs first and from the
 * memoized permission map, so a role holder pays no extra round trip.
 */
export async function checkEventAccess(
  supabase: SupabaseClient,
  { table, level, eventId, role }: EventAccessCheck,
  message?: string,
): Promise<PermissionDenied | null> {
  const denied = await checkAnyPermission(
    supabase,
    role ?? [{ resource: "events", level }],
    message,
  );
  if (!denied) return null;
  if ((await getMyGrantedEvents(supabase)).length === 0) return denied;

  const { data } = eventId
    ? await supabase.rpc("has_event_access", {
        p_event_id: eventId,
        p_table_name: table,
        p_min_level: level,
      })
    : await supabase.rpc("has_any_event_access", {
        p_table_name: table,
        p_min_level: level,
      });
  return data === true ? null : denied;
}
