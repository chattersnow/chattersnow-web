"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkAnyPermission } from "@/lib/auth/permissions";
import { getRequestHost } from "@/lib/request-origin";
import { lookupInventoryTag } from "@/lib/inventory-tags";
import {
  addToDistributionDraft,
  getDistributionDraft,
  type DistributionDraft,
} from "@/lib/inventory-distribution-draft";

/**
 * The scanned-distribution list behind RecordDistributionModal's scan mode
 * (#1420 part 3). Every action is gated like record_event_distribution itself,
 * and the draft tables' RLS keeps each list to its owner.
 */

const RECORD_ACCESS = [
  { resource: "inventory", level: "manage" },
  { resource: "inventory_intake", level: "manage" },
] as const;

export type ScannedItem = {
  id: string;
  description: string;
  size: string | null;
  status: string;
  intendedUse: string;
};

/**
 * The items a scan identifies: a tag URL, a bare code, a UPC or an NFC serial
 * (the lookup in src/lib/inventory-tags.ts). Several for a UPC shared by many
 * pieces; none for an unknown code, a blank label, or a code the caller may
 * not see -- the same answer for all three.
 */
export async function lookupScannedItemsAction(
  scanned: string,
): Promise<{ data: ScannedItem[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkAnyPermission(supabase, [
    ...RECORD_ACCESS,
  ]);
  if (permissionError) return permissionError;

  const { matches, error } = await lookupInventoryTag(supabase, scanned, {
    host: await getRequestHost(),
  });
  if (error) return { error: "Could not look up that scan. Please try again." };

  const ids = [
    ...new Set(matches.flatMap((match) => (match.item ? [match.item.id] : []))),
  ];
  if (ids.length === 0) return { data: [] };

  const { data, error: itemsError } = await supabase
    .from("inventory_items")
    .select("id, description, size, status, intended_use")
    .in("id", ids)
    .order("description", { ascending: true });
  if (itemsError)
    return { error: "Could not look up that scan. Please try again." };

  return {
    data: (data ?? []).map((item) => ({
      id: item.id,
      description: item.description,
      size: item.size,
      status: item.status,
      intendedUse: item.intended_use,
    })),
  };
}

export async function getDistributionDraftAction(
  eventId: string | null,
): Promise<{ data: DistributionDraft | null } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkAnyPermission(supabase, [
    ...RECORD_ACCESS,
  ]);
  if (permissionError) return permissionError;

  const { draft, error } = await getDistributionDraft(supabase, eventId);
  if (error) return { error: "Could not load the scanned list." };
  return { data: draft };
}

export async function addToDistributionDraftAction(
  itemId: string,
  eventId: string | null,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkAnyPermission(supabase, [
    ...RECORD_ACCESS,
  ]);
  if (permissionError) return permissionError;

  const { error } = await addToDistributionDraft(supabase, itemId, eventId);
  if (error) return { error: "Could not add that item. Please try again." };
  return { success: true };
}

export async function removeFromDistributionDraftAction(
  itemId: string,
  eventId: string | null,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkAnyPermission(supabase, [
    ...RECORD_ACCESS,
  ]);
  if (permissionError) return permissionError;

  let draftQuery = supabase.from("inventory_distribution_drafts").select("id");
  draftQuery = eventId
    ? draftQuery.eq("event_id", eventId)
    : draftQuery.is("event_id", null);
  const { data: draft, error: draftError } = await draftQuery.maybeSingle();
  if (draftError)
    return { error: "Could not remove that item. Please try again." };
  if (!draft) return { success: true };

  const { error } = await supabase
    .from("inventory_distribution_draft_items")
    .delete()
    .eq("draft_id", draft.id)
    .eq("item_id", itemId);
  if (error) return { error: "Could not remove that item. Please try again." };
  return { success: true };
}

export async function discardDistributionDraftAction(
  eventId: string | null,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkAnyPermission(supabase, [
    ...RECORD_ACCESS,
  ]);
  if (permissionError) return permissionError;

  let query = supabase.from("inventory_distribution_drafts").delete();
  query = eventId ? query.eq("event_id", eventId) : query.is("event_id", null);
  const { error } = await query;
  if (error) return { error: "Could not clear the list. Please try again." };
  return { success: true };
}

export type RecordDraftInput = {
  eventId: string | null;
  occurredAt?: string;
  reason?: string;
  recipientPersonId?: string;
  markDistributed: boolean;
};

/**
 * Records every scanned piece as its own distribution, in one transaction
 * (record_distribution_draft()), and clears the list. If one was given out by
 * someone else since it was scanned, nothing is recorded and `itemId` names it.
 */
export async function recordDistributionDraftAction(
  input: RecordDraftInput,
): Promise<{ count: number } | { error: string; itemId?: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkAnyPermission(supabase, [
    ...RECORD_ACCESS,
  ]);
  if (permissionError) return permissionError;

  const { data, error } = await supabase.rpc("record_distribution_draft", {
    ...(input.eventId ? { p_event_id: input.eventId } : {}),
    p_occurred_at: input.occurredAt
      ? new Date(input.occurredAt).toISOString()
      : new Date().toISOString(),
    ...(input.reason?.trim() ? { p_reason: input.reason.trim() } : {}),
    ...(input.recipientPersonId
      ? { p_recipient_person_id: input.recipientPersonId }
      : {}),
    p_mark_item_distributed: input.markDistributed,
  });

  if (error) {
    if (error.message === "DRAFT_EMPTY") {
      return { error: "Scan at least one item first." };
    }
    if (error.message === "ITEM_ALREADY_DISTRIBUTED") {
      return {
        error:
          "One of these items has already been distributed. Remove it and record the rest.",
        itemId: error.details || undefined,
      };
    }
    return { error: "Could not record the distribution. Please try again." };
  }

  revalidatePath("/portal/home");
  revalidatePath("/portal/inventory/items");
  revalidatePath("/portal/inventory/distribution");
  revalidatePath("/portal/events");
  return { count: data ?? 0 };
}
