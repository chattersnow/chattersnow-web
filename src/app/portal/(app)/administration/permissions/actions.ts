"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PERMISSION_LEVELS,
  checkPermission,
  type PermissionLevel,
} from "@/lib/auth/permissions";

function isPermissionLevel(value: string): value is PermissionLevel {
  return (PERMISSION_LEVELS as readonly string[]).includes(value);
}

export async function updateRolePermissionsAction(
  updates: { role_id: string; resource_id: string; level: string }[],
): Promise<{ error: string } | { success: true }> {
  if (updates.length === 0) {
    return { success: true };
  }
  for (const update of updates) {
    if (!isPermissionLevel(update.level)) {
      return { error: "Unknown permission level." };
    }
  }

  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "administration",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("role_permissions")
    .upsert(updates, { onConflict: "role_id,resource_id" });
  if (error) {
    return { error: "Could not update permissions. Please try again." };
  }

  revalidatePath("/portal/administration/permissions");
  return { success: true };
}
