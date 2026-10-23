"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { EVENT_ACCESS_AREAS } from "@/lib/auth/event-access";

/**
 * The organization's offered areas for per-event access (#1689). Written
 * through set_event_access_offered_areas(), which requires
 * `administration: manage` -- app_settings' own writer is
 * `system_settings: manage`, and who may be granted what is administration's.
 * Withdrawing an area keeps every grant row; it simply reaches nothing until
 * the area is offered again.
 */
export async function setEventAccessOfferedAreasAction(
  areas: string[],
): Promise<{ error: string } | { success: true; offered: string[] }> {
  const supabase = await createSupabaseServerClient();
  const denied = await checkPermission(supabase, "administration", "manage");
  if (denied) return denied;

  const known = EVENT_ACCESS_AREAS.filter((area) => areas.includes(area));
  const { data, error } = await supabase.rpc("set_event_access_offered_areas", {
    p_areas: known,
  });
  if (error) {
    return { error: "Could not save the offered areas. Please try again." };
  }

  revalidatePath("/portal/administration/roles");
  return { success: true, offered: (data ?? []) as string[] };
}
