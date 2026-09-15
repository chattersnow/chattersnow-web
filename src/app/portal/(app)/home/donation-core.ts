// Recording a donation, with no Next in it (#1082 Phase 1).
//
// The Phase 0 spike established that a non-Next client can already perform
// this write: create_donation_with_items is `security definer` and checks
// has_permission() inside the function body, so authorization holds wherever
// the call comes from. What does *not* hold outside this app is the input
// normalization -- parseDonationInput trims, defaults and rejects things the
// database does not -- so that is what this module exists to make shareable.
//
// Takes an already-authenticated client, so it works identically under a
// cookie session (the Server Action) or a bearer token (anything else). The
// `"use server"` wrapper in actions.ts adds nothing but revalidatePath.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseDonationInput,
  type CreateDonationInput,
  type DonationItemInput,
} from "./donation-form";
import { checkAnyPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import {
  actionError,
  fromGuard,
  fromParseError,
  type ActionFailure,
} from "@/lib/portal/action-result";

export type { CreateDonationInput, DonationItemInput };

/** Per-colour ticket counts to hand to the donor, when the donation was
 *  recorded against an event whose giveaway has tiers configured. */
export type GiveawayTicketTotal = {
  tier_id: string;
  tier_key: string;
  tier_label: string;
  tier_rank: number;
  quantity: number;
};

export type DonationGiveawayGrant = {
  giveawayId: string;
  totals: GiveawayTicketTotal[];
  /** Items no tier could be resolved for. These earned nothing, so the UI asks
   *  the staffer to classify them rather than quietly under-granting. */
  untieredItemIds: string[];
};

export type CreateDonationResult =
  ActionFailure | { success: true; giveaway: DonationGiveawayGrant | null };

export async function createDonation(
  supabase: SupabaseClient,
  input: CreateDonationInput,
): Promise<CreateDonationResult> {
  const userResult = await checkUser(
    supabase,
    "You must be signed in to record a donation.",
  );
  if ("error" in userResult) return fromGuard("unauthenticated", userResult);
  const permissionError = await checkAnyPermission(supabase, [
    { resource: "finance", level: "manage" },
    { resource: "inventory_intake", level: "manage" },
  ]);
  if (permissionError) return fromGuard("forbidden", permissionError);

  const parsed = parseDonationInput(input);
  if ("error" in parsed) return fromParseError(parsed);

  const { data, error } = await supabase.rpc(
    "create_donation_with_items",
    parsed.data,
  );

  if (error) {
    return actionError(
      "server_error",
      "Could not save the donation. Please try again.",
    );
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        donation_id: string;
        giveaway_id: string | null;
        untiered_item_ids: string[] | null;
      }
    | undefined;

  // The donation itself is saved either way, so a failure to read back the
  // ticket totals must not read as a failed donation. Fall back to no grant
  // and let the staffer check the giveaway tab.
  if (!row?.giveaway_id) return { success: true, giveaway: null };

  const { data: totals } = await supabase.rpc("giveaway_ticket_totals", {
    p_giveaway_id: row.giveaway_id,
    p_donation_id: row.donation_id,
    p_sale_id: null,
  });

  return {
    success: true,
    giveaway: {
      giveawayId: row.giveaway_id,
      totals: (totals ?? []) as GiveawayTicketTotal[],
      untieredItemIds: row.untiered_item_ids ?? [],
    },
  };
}
