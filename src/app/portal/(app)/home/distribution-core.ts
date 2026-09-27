// Recording a distribution, with no Next in it (#1082 Phase 1). See
// donation-core.ts for why these cores exist; the same reasoning applies.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseDistributionInput,
  type RecordDistributionInput,
} from "./distribution-form";
import { checkAnyPermission } from "@/lib/auth/permissions";
import { toReleasedTags, type ReleasedTag } from "@/lib/inventory-tags";
import { checkUser } from "@/lib/auth/current-user";
import {
  actionError,
  fromGuard,
  fromParseError,
  type ActionFailure,
} from "@/lib/portal/action-result";

export type { RecordDistributionInput };

export type DistributionActionResult =
  ActionFailure | { success: true; releasedTags: ReleasedTag[] };

export async function recordEventDistribution(
  supabase: SupabaseClient,
  input: RecordDistributionInput,
): Promise<DistributionActionResult> {
  const userResult = await checkUser(
    supabase,
    "You must be signed in to record a distribution.",
  );
  if ("error" in userResult) return fromGuard("unauthenticated", userResult);
  const permissionError = await checkAnyPermission(supabase, [
    { resource: "inventory", level: "manage" },
    { resource: "inventory_intake", level: "manage" },
  ]);
  if (permissionError) return fromGuard("forbidden", permissionError);

  const parsed = parseDistributionInput(input);
  if ("error" in parsed) return fromParseError(parsed);

  const { data: movementId, error } = await supabase.rpc(
    "record_event_distribution",
    parsed.data,
  );

  if (error) {
    // Raised by record_event_distribution when the item was claimed between
    // this picker being rendered and this submit landing -- another staffer
    // gave it out first (#748). Worth naming, since "try again" is the one
    // thing that cannot help here.
    if (error.message === "ITEM_ALREADY_DISTRIBUTED") {
      return actionError(
        "conflict",
        "That item has already been distributed. Refresh and pick another.",
      );
    }
    return actionError(
      "server_error",
      "Could not record the distribution. Please try again.",
    );
  }

  // The numbered codes this handout freed (#1444), tied to it by its
  // movement. A failure here costs only the reminder, not the handout.
  const { data: released } = movementId
    ? await supabase.rpc("released_numbered_inventory_tags", {
        p_movement_ids: [movementId],
      })
    : { data: null };
  return { success: true, releasedTags: toReleasedTags(released) };
}
