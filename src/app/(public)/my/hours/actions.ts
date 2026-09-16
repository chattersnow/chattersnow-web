"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/get-client-ip";
import { LOG_HOURS_ERRORS, parseMyHoursForm } from "@/lib/constituent/hours";
import { MY_PATH_PREFIX } from "@/lib/constituent/paths";

const MY_HOURS_PATH = `${MY_PATH_PREFIX}/hours`;

export type LogMyHoursResult = { error: string } | { submitted: true };

/**
 * Logs hours the caller volunteered (#1165).
 *
 * Lands in `volunteer_hour_submissions` as pending, never in the ledger: the
 * decision taken in this ticket is that self-logged hours are provisional
 * until a `volunteers:manage` holder confirms them, because an unreviewed
 * number that reaches an annual report cannot be taken back.
 *
 * Rate-limited per (route, ip) inside the RPC, like every other write on this
 * host that anyone with an account can reach.
 */
export async function logMyVolunteerHoursAction(
  formData: FormData,
): Promise<LogMyHoursResult> {
  const parsed = parseMyHoursForm(formData);
  if ("error" in parsed) return parsed;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("log_my_volunteer_hours", {
    ...parsed.args,
    p_ip_address: await getClientIp(),
  });

  if (error) {
    return {
      error:
        LOG_HOURS_ERRORS[error.message] ??
        "Could not log those hours. Please try again.",
    };
  }

  revalidatePath(MY_HOURS_PATH);
  revalidatePath(MY_PATH_PREFIX);
  return { submitted: true };
}
