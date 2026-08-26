"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import {
  VOLUNTEER_APPLICATION_STATUSES,
  type VolunteerApplicationStatus,
} from "./application-types";

export type VolunteerApplicationActionResult =
  { error: string } | { success: true };

export async function updateVolunteerApplicationStatusAction(
  id: string,
  status: VolunteerApplicationStatus,
): Promise<VolunteerApplicationActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update a volunteer application.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "volunteers",
    "manage",
  );
  if (permissionError) return permissionError;

  if (!(VOLUNTEER_APPLICATION_STATUSES as readonly string[]).includes(status)) {
    return { error: "Not a valid status." };
  }

  const { error } = await supabase
    .from("volunteer_applications")
    .update({ status })
    .eq("id", id);

  if (error) {
    return {
      error: "Could not update this application. Please try again.",
    };
  }

  revalidatePath("/portal/volunteers/applications");
  return { success: true };
}
