import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * One person's email opt-ins, as `kind -> enabled`, for the switches on
 * /portal/account.
 *
 * The `person_id` filter is the point of this helper (#1043). Reading the table
 * unfiltered and letting the select policy scope it looks right and is wrong for
 * exactly one reader: the policy (20260906140000) admits
 * `has_permission('administration', 'manage')` as well as `my_person_id()`, so
 * that an administrator can clear a row to unblock a person merge. An
 * administrator's unfiltered read therefore returns every person's rows in the
 * tenant, and the last one PostgREST happens to return per kind wins -- which
 * with two administrators looks precisely like one account's switches moving
 * the other's.
 *
 * A kind with no row is off: nothing is sent unless somebody turns it on.
 */
export async function getMyNotificationPreferences(
  supabase: SupabaseClient,
  personId: string | null,
): Promise<Record<string, boolean>> {
  const enabledByKind: Record<string, boolean> = {};
  if (!personId) return enabledByKind;

  const { data, error } = await supabase
    .from("person_notification_preferences")
    .select("kind, enabled")
    .eq("person_id", personId);

  if (error) {
    // Failing closed, like every other reader of this table: an unreadable
    // preference is not an opted-in one.
    console.error(
      "[notifications] could not read your notification preferences",
      error,
    );
    return enabledByKind;
  }

  for (const row of data ?? []) {
    enabledByKind[row.kind as string] = Boolean(row.enabled);
  }
  return enabledByKind;
}
