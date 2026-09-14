// Recording a distribution, with no Next in it (#1082 Phase 1). See
// donation-core.ts for why these cores exist; the same reasoning applies.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseDistributionInput,
  type RecordDistributionInput,
} from "./distribution-form";
import { checkAnyPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";

export type { RecordDistributionInput };

export type DistributionActionResult = { error: string } | { success: true };

export async function recordEventDistribution(
  supabase: SupabaseClient,
  input: RecordDistributionInput,
): Promise<DistributionActionResult> {
  const userResult = await checkUser(
    supabase,
    "You must be signed in to record a distribution.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkAnyPermission(supabase, [
    { resource: "inventory", level: "manage" },
    { resource: "inventory_intake", level: "manage" },
  ]);
  if (permissionError) return permissionError;

  const parsed = parseDistributionInput(input);
  if ("error" in parsed) return parsed;

  const { error } = await supabase.rpc(
    "record_event_distribution",
    parsed.data,
  );

  if (error) {
    // Raised by record_event_distribution when the item was claimed between
    // this picker being rendered and this submit landing -- another staffer
    // gave it out first (#748). Worth naming, since "try again" is the one
    // thing that cannot help here.
    if (error.message === "ITEM_ALREADY_DISTRIBUTED") {
      return {
        error:
          "That item has already been distributed. Refresh and pick another.",
      };
    }
    return { error: "Could not record the distribution. Please try again." };
  }

  return { success: true };
}
