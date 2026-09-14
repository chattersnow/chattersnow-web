// Checking an attendee in and undoing it, with no Next in it (#1082 Phase 1).
// See home/donation-core.ts for why these cores exist.
//
// Unlike the donation and distribution paths this is a plain table update
// rather than a `security definer` RPC, so what refuses an under-privileged
// client here is the `event_registrations` RLS policy: the update matches no
// row and affects nothing (measured in the Phase 0 spike). The
// `checkPermission` call below is what turns that silence into a message.
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";

export type RegistrantActionResult = { error: string } | { success: true };

export async function checkInRegistrant(
  supabase: SupabaseClient,
  id: string,
): Promise<RegistrantActionResult> {
  const userResult = await checkUser(
    supabase,
    "You must be signed in to check in a registrant.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("event_registrations")
    .update({ checked_in_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return { error: "Could not check in this registrant. Please try again." };
  }

  return { success: true };
}

export async function undoCheckIn(
  supabase: SupabaseClient,
  id: string,
): Promise<RegistrantActionResult> {
  const userResult = await checkUser(
    supabase,
    "You must be signed in to undo a check-in.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("event_registrations")
    .update({ checked_in_at: null })
    .eq("id", id);

  if (error) {
    return { error: "Could not undo this check-in. Please try again." };
  }

  return { success: true };
}
