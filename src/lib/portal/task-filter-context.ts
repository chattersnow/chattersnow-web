import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCurrentPersonId } from "@/lib/auth/current-person";
import { getOrgTimeZone } from "@/lib/org-timezone";
import { todayInZone } from "@/lib/time";
import type { TaskFilterContext, TaskFilters } from "./task-list";

/**
 * What the task filters are measured against on the server: the
 * organization's day, and the signed-in user's `people` row -- looked up only
 * when `owner` is Mine, the one filter that needs it.
 */
export async function resolveTaskFilterContext(
  supabase: SupabaseClient,
  filters: Pick<TaskFilters, "owner">,
  options: { today?: string } = {},
): Promise<TaskFilterContext & { timeZone: string }> {
  const [timeZone, currentPersonId] = await Promise.all([
    getOrgTimeZone(supabase),
    filters.owner === "mine"
      ? resolveCurrentPersonId(supabase)
      : Promise.resolve(null),
  ]);
  return {
    timeZone,
    today: options.today ?? todayInZone(timeZone),
    currentPersonId,
  };
}
