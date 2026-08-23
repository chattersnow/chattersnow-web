"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PERMISSION_LEVELS, type PermissionLevel } from "@/lib/auth/permissions";

function isPermissionLevel(value: string): value is PermissionLevel {
  return (PERMISSION_LEVELS as readonly string[]).includes(value);
}

export async function updateRolePermissionAction(
  roleId: string,
  resourceId: string,
  level: string,
): Promise<{ error: string } | { success: true }> {
  if (!isPermissionLevel(level)) {
    return { error: "Unknown permission level." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("role_permissions")
    .upsert(
      { role_id: roleId, resource_id: resourceId, level },
      { onConflict: "role_id,resource_id" },
    );
  if (error) {
    return { error: "Could not update permission. Please try again." };
  }

  revalidatePath("/portal/administration/permissions");
  return { success: true };
}
