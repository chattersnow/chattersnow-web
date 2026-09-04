"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import type { GiveawayActionResult } from "./giveaway-actions";

export type GiveawayTier = {
  id: string;
  giveaway_id: string;
  key: string;
  label: string;
  rank: number;
};

/** One cell of the tier matrix: donating (or buying) at `source_tier_id` earns
 *  `quantity` tickets of colour `ticket_tier_id`. */
export type GiveawayTierGrant = {
  id: string;
  source_tier_id: string;
  ticket_tier_id: string;
  quantity: number;
};

export type GiveawayTierRule = {
  id: string;
  tier_id: string;
  match_text: string;
};

export type GiveawayBucket = {
  id: string;
  giveaway_id: string;
  tier_id: string;
  name: string;
  rank: number;
};

export type GiveawayTicketPackage = {
  id: string;
  giveaway_id: string;
  name: string;
  price: number | string;
  tier_id: string;
  bundle_quantity: number;
  rank: number;
  is_active: boolean;
};

export type GiveawayTicketSale = {
  id: string;
  package_id: string;
  purchaser_person_id: string | null;
  purchaser: { id: string; name: string | null } | null;
  quantity: number;
  unit_price: number | string;
  amount: number | string;
  sold_at: string;
  notes: string | null;
};

export type GiveawayTicketTotal = {
  tier_id: string;
  tier_key: string;
  tier_label: string;
  tier_rank: number;
  quantity: number;
};

export type GiveawayTierConfig = {
  tiers: GiveawayTier[];
  grants: GiveawayTierGrant[];
  rules: GiveawayTierRule[];
  buckets: GiveawayBucket[];
  packages: GiveawayTicketPackage[];
  totals: GiveawayTicketTotal[];
};

/**
 * Everything the giveaway's tier/bucket/package tabs need, in one round trip.
 * `tiers` empty means the giveaway hasn't been set up yet and the UI offers to
 * seed the defaults.
 */
export async function getGiveawayTierConfigAction(
  giveawayId: string,
): Promise<{ data: GiveawayTierConfig } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "events", "view");
  if (permissionError) return permissionError;

  const [tiers, grants, rules, buckets, packages, totals] = await Promise.all([
    supabase
      .from("giveaway_tiers")
      .select("id, giveaway_id, key, label, rank")
      .eq("giveaway_id", giveawayId)
      .order("rank"),
    supabase
      .from("giveaway_tier_grants")
      .select("id, source_tier_id, ticket_tier_id, quantity")
      .eq("giveaway_id", giveawayId),
    supabase
      .from("giveaway_tier_rules")
      .select("id, tier_id, match_text")
      .eq("giveaway_id", giveawayId)
      .order("match_text"),
    supabase
      .from("giveaway_buckets")
      .select("id, giveaway_id, tier_id, name, rank")
      .eq("giveaway_id", giveawayId)
      .order("rank"),
    supabase
      .from("giveaway_ticket_packages")
      .select(
        "id, giveaway_id, name, price, tier_id, bundle_quantity, rank, is_active",
      )
      .eq("giveaway_id", giveawayId)
      .order("rank"),
    supabase.rpc("giveaway_ticket_totals", {
      p_giveaway_id: giveawayId,
      p_donation_id: null,
      p_sale_id: null,
    }),
  ]);

  const failed = [tiers, grants, rules, buckets, packages, totals].find(
    (result) => result.error,
  );
  if (failed) {
    return { error: "Could not load the giveaway setup. Please try again." };
  }

  return {
    data: {
      tiers: (tiers.data ?? []) as GiveawayTier[],
      grants: (grants.data ?? []) as GiveawayTierGrant[],
      rules: (rules.data ?? []) as GiveawayTierRule[],
      buckets: (buckets.data ?? []) as GiveawayBucket[],
      packages: (packages.data ?? []) as GiveawayTicketPackage[],
      totals: (totals.data ?? []) as GiveawayTicketTotal[],
    },
  };
}

async function requireManage(): Promise<
  | { supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> }
  | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update the giveaway.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;
  return { supabase };
}

/** Seeds gold/silver/bronze and the default grant matrix. Idempotent server-side,
 *  so a double click can't produce two sets of tiers. */
export async function seedGiveawayTiersAction(
  giveawayId: string,
): Promise<GiveawayActionResult> {
  const auth = await requireManage();
  if ("error" in auth) return auth;

  const { error } = await auth.supabase.rpc("seed_giveaway_tiers", {
    p_giveaway_id: giveawayId,
  });
  if (error) {
    return { error: "Could not set up the giveaway tiers. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

/** Saves the whole matrix at once — it's edited as a grid, so a per-cell save
 *  would leave it half-applied if one call failed. */
export async function updateGiveawayTierGrantsAction(
  updates: { id: string; quantity: number }[],
): Promise<GiveawayActionResult> {
  const auth = await requireManage();
  if ("error" in auth) return auth;

  for (const update of updates) {
    if (!Number.isInteger(update.quantity) || update.quantity < 0) {
      return { error: "Ticket counts must be whole numbers of 0 or more." };
    }
  }

  for (const update of updates) {
    const { error } = await auth.supabase
      .from("giveaway_tier_grants")
      .update({ quantity: update.quantity })
      .eq("id", update.id);
    if (error) {
      return { error: "Could not save the tier setup. Please try again." };
    }
  }

  revalidatePath("/portal/events");
  return { success: true };
}

export async function addGiveawayTierRuleAction(
  giveawayId: string,
  tierId: string,
  matchText: string,
): Promise<GiveawayActionResult> {
  const auth = await requireManage();
  if ("error" in auth) return auth;

  const trimmed = matchText.trim();
  if (!trimmed) return { error: "Enter a keyword to match on." };

  const { error } = await auth.supabase.from("giveaway_tier_rules").insert({
    giveaway_id: giveawayId,
    tier_id: tierId,
    match_text: trimmed,
  });
  if (error) return { error: "Could not add the keyword. Please try again." };

  revalidatePath("/portal/events");
  return { success: true };
}

export async function deleteGiveawayTierRuleAction(
  ruleId: string,
): Promise<GiveawayActionResult> {
  const auth = await requireManage();
  if ("error" in auth) return auth;

  const { error } = await auth.supabase
    .from("giveaway_tier_rules")
    .delete()
    .eq("id", ruleId);
  if (error)
    return { error: "Could not remove the keyword. Please try again." };

  revalidatePath("/portal/events");
  return { success: true };
}

export async function upsertGiveawayBucketAction(
  giveawayId: string,
  input: { id?: string; tierId: string; name: string; rank: number },
): Promise<GiveawayActionResult> {
  const auth = await requireManage();
  if ("error" in auth) return auth;

  const name = input.name.trim();
  if (!name) return { error: "Bucket name is required." };
  if (!input.tierId)
    return { error: "Select which ticket colour this bucket takes." };

  const row = {
    giveaway_id: giveawayId,
    tier_id: input.tierId,
    name,
    rank: input.rank,
  };

  const { error } = input.id
    ? await auth.supabase
        .from("giveaway_buckets")
        .update(row)
        .eq("id", input.id)
    : await auth.supabase.from("giveaway_buckets").insert(row);

  if (error) return { error: "Could not save the bucket. Please try again." };

  revalidatePath("/portal/events");
  return { success: true };
}

export async function deleteGiveawayBucketAction(
  bucketId: string,
): Promise<GiveawayActionResult> {
  const auth = await requireManage();
  if ("error" in auth) return auth;

  // Prizes point at buckets with on delete set null, so removing a bucket
  // releases its prizes rather than deleting them.
  const { error } = await auth.supabase
    .from("giveaway_buckets")
    .delete()
    .eq("id", bucketId);
  if (error) return { error: "Could not remove the bucket. Please try again." };

  revalidatePath("/portal/events");
  return { success: true };
}

export async function upsertGiveawayPackageAction(
  giveawayId: string,
  input: {
    id?: string;
    name: string;
    price: number;
    tierId: string;
    bundleQuantity: number;
    rank: number;
    isActive: boolean;
  },
): Promise<GiveawayActionResult> {
  const auth = await requireManage();
  if ("error" in auth) return auth;

  const name = input.name.trim();
  if (!name) return { error: "Package name is required." };
  if (!input.tierId) return { error: "Select the tier this package grants." };
  if (!Number.isFinite(input.price) || input.price < 0) {
    return { error: "Price must be a positive number." };
  }
  if (!Number.isInteger(input.bundleQuantity) || input.bundleQuantity < 1) {
    return {
      error: "Bundles per package must be a whole number of 1 or more.",
    };
  }

  const row = {
    giveaway_id: giveawayId,
    name,
    price: input.price,
    tier_id: input.tierId,
    bundle_quantity: input.bundleQuantity,
    rank: input.rank,
    is_active: input.isActive,
  };

  const { error } = input.id
    ? await auth.supabase
        .from("giveaway_ticket_packages")
        .update(row)
        .eq("id", input.id)
    : await auth.supabase.from("giveaway_ticket_packages").insert(row);

  if (error) return { error: "Could not save the package. Please try again." };

  revalidatePath("/portal/events");
  return { success: true };
}

export async function deleteGiveawayPackageAction(
  packageId: string,
): Promise<GiveawayActionResult> {
  const auth = await requireManage();
  if ("error" in auth) return auth;

  const { error } = await auth.supabase
    .from("giveaway_ticket_packages")
    .delete()
    .eq("id", packageId);

  if (error) {
    // Sales reference packages with on delete restrict, so a package that has
    // already sold can't vanish out from under its sale history.
    return {
      error:
        "Could not remove the package. Deactivate it instead if it has already sold tickets.",
    };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

/**
 * Assigns a prize to a draw bucket, or clears it with a null bucketId.
 *
 * Kept out of the prize create/update RPCs on purpose: those are
 * security-definer because they also reserve the linked inventory item, and
 * bucket assignment needs none of that -- giveaway_prizes is already writable
 * under events:manage.
 */
export async function setGiveawayPrizeBucketAction(
  prizeId: string,
  bucketId: string | null,
): Promise<GiveawayActionResult> {
  const auth = await requireManage();
  if ("error" in auth) return auth;

  const { error } = await auth.supabase
    .from("giveaway_prizes")
    .update({ bucket_id: bucketId })
    .eq("id", prizeId);

  if (error) {
    return {
      error: "Could not assign the prize to that bucket. Please try again.",
    };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

export type RecordSaleResult =
  { error: string } | { success: true; totals: GiveawayTicketTotal[] };

/** Records a sale and returns the tickets to hand over. Payment is taken
 *  outside the system — this is a record of it, not a charge. */
export async function recordGiveawayTicketSaleAction(
  giveawayId: string,
  input: {
    packageId: string;
    quantity: number;
    purchaserPersonId?: string | null;
    soldAt?: string | null;
    notes?: string | null;
  },
): Promise<RecordSaleResult> {
  const auth = await requireManage();
  if ("error" in auth) return auth;

  if (!input.packageId) return { error: "Select a ticket package." };
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    return { error: "Quantity must be a whole number of 1 or more." };
  }

  const { data, error } = await auth.supabase.rpc(
    "record_giveaway_ticket_sale",
    {
      p_giveaway_id: giveawayId,
      p_package_id: input.packageId,
      p_quantity: input.quantity,
      p_purchaser_person_id: input.purchaserPersonId ?? null,
      p_sold_at: input.soldAt ?? null,
      p_notes: input.notes?.trim() || null,
    },
  );

  if (error) {
    if (error.message?.includes("no longer on sale")) {
      return {
        error: "That package is no longer on sale. Refresh and pick another.",
      };
    }
    return { error: "Could not record the sale. Please try again." };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    { sale_id: string } | undefined;

  revalidatePath("/portal/events");

  if (!row?.sale_id) return { success: true, totals: [] };

  const { data: totals } = await auth.supabase.rpc("giveaway_ticket_totals", {
    p_giveaway_id: giveawayId,
    p_donation_id: null,
    p_sale_id: row.sale_id,
  });

  return { success: true, totals: (totals ?? []) as GiveawayTicketTotal[] };
}

export async function listGiveawayTicketSalesAction(
  giveawayId: string,
): Promise<{ data: GiveawayTicketSale[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "events", "view");
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("giveaway_ticket_sales")
    .select(
      "id, package_id, purchaser_person_id, purchaser:people(id, name), quantity, unit_price, amount, sold_at, notes",
    )
    .eq("giveaway_id", giveawayId)
    .order("sold_at", { ascending: false });

  if (error) {
    return { error: "Could not load ticket sales. Please try again." };
  }
  return { data: (data ?? []) as unknown as GiveawayTicketSale[] };
}

export async function deleteGiveawayTicketSaleAction(
  saleId: string,
): Promise<GiveawayActionResult> {
  const auth = await requireManage();
  if ("error" in auth) return auth;

  // Grants cascade from the sale, so voiding a sale also removes the tickets it
  // issued and the pooled totals stay correct.
  const { error } = await auth.supabase
    .from("giveaway_ticket_sales")
    .delete()
    .eq("id", saleId);
  if (error) return { error: "Could not void the sale. Please try again." };

  revalidatePath("/portal/events");
  return { success: true };
}
