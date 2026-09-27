"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import { getRequestHost } from "@/lib/request-origin";
import { parseScannedTag } from "@/lib/inventory-tags";
import {
  MAX_LABEL_ITEMS,
  NUMBERED_CODES_PATH,
  type NumberRange,
} from "@/lib/inventory-labels";

/**
 * Reusable numbered codes (#1444). Every write here is inventory:manage, and
 * each function re-checks it: these gates only give a friendlier refusal.
 */

async function manageGuard(message: string) {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(supabase, message);
  if ("error" in userResult) return { error: userResult.error };
  const permissionError = await checkPermission(
    supabase,
    "inventory",
    "manage",
  );
  if (permissionError) return permissionError;
  return { supabase };
}

function revalidateItem(itemId?: string | null) {
  revalidatePath(NUMBERED_CODES_PATH);
  revalidatePath("/portal/inventory/items");
  if (itemId) revalidatePath(`/portal/inventory/items/${itemId}`);
}

export async function setTagPrefixAction(
  prefix: string,
): Promise<{ prefix: string } | { error: string }> {
  const guard = await manageGuard("You must be signed in to set the prefix.");
  if ("error" in guard) return guard;

  const value = prefix.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(value)) {
    return { error: "The prefix is three letters, A to Z." };
  }
  const { data, error } = await guard.supabase.rpc("set_inventory_tag_prefix", {
    p_prefix: value,
  });
  if (error) {
    if (error.message === "INVENTORY_TAG_PREFIX_TAKEN") {
      return { error: `Another organization already uses ${value}.` };
    }
    if (error.message === "INVENTORY_TAG_PREFIX_LOCKED") {
      return {
        error:
          "The prefix can't change once codes exist: printed labels and NFC tags already carry it.",
      };
    }
    return { error: "Could not save the prefix. Please try again." };
  }
  revalidatePath(NUMBERED_CODES_PATH);
  return { prefix: data ?? value };
}

export async function generateNumberedCodesAction(
  count: number,
): Promise<{ range: NumberRange } | { error: string }> {
  const guard = await manageGuard("You must be signed in to create codes.");
  if ("error" in guard) return guard;

  if (!Number.isInteger(count) || count < 1 || count > MAX_LABEL_ITEMS) {
    return { error: `Choose between 1 and ${MAX_LABEL_ITEMS} codes.` };
  }
  const { data, error } = await guard.supabase.rpc(
    "generate_numbered_inventory_tags",
    { p_count: count },
  );
  if (error || !data || data.length === 0) {
    if (error?.message === "INVENTORY_TAG_PREFIX_MISSING") {
      return { error: "Set the prefix before creating codes." };
    }
    return { error: "Could not create the codes. Please try again." };
  }
  const numbers = data.map((row) => row.number);
  revalidatePath(NUMBERED_CODES_PATH);
  return { range: { from: Math.min(...numbers), to: Math.max(...numbers) } };
}

export type AssignNumberedCodeResult =
  | { outcome: "assigned" | "already"; code: string }
  | {
      outcome: "held";
      code: string;
      holder: { id: string; description: string };
    }
  | { error: string };

/**
 * Puts the numbered code in hand on an item. A code another item holds comes
 * back as `held`, with that item, and nothing changes until the caller asks
 * again with `move`.
 */
export async function assignNumberedCodeAction(
  itemId: string,
  code: string,
  move = false,
): Promise<AssignNumberedCodeResult> {
  const guard = await manageGuard("You must be signed in to assign a code.");
  if ("error" in guard) return guard;

  const typed = code.trim();
  if (!typed) return { error: "Enter the code on the tag." };
  // A scanned label or NFC tag hands over its URL; the code is in it, and a
  // URL from another organization's portal carries none.
  const scanned = parseScannedTag(typed, { host: await getRequestHost() });

  const { data, error } = await guard.supabase.rpc(
    "assign_numbered_inventory_tag",
    { p_item_id: itemId, p_code: scanned.numbered ?? typed, p_move: move },
  );
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    return { error: "Could not assign the code. Please try again." };
  }

  switch (row.outcome) {
    case "assigned":
    case "already":
      revalidateItem(itemId);
      return { outcome: row.outcome, code: row.code };
    case "held":
      return {
        outcome: "held",
        code: row.code,
        holder: {
          id: row.holder_item_id,
          description: row.holder_description,
        },
      };
    case "item_gone":
      return {
        error: `This item has left inventory, so it can't take ${row.code}.`,
      };
    default:
      return { error: `No numbered code matches “${typed}”.` };
  }
}

export async function unassignNumberedCodeAction(
  itemId: string,
): Promise<{ code: string | null } | { error: string }> {
  const guard = await manageGuard("You must be signed in to unassign a code.");
  if ("error" in guard) return guard;

  const { data, error } = await guard.supabase.rpc(
    "unassign_numbered_inventory_tag",
    { p_item_id: itemId },
  );
  if (error) return { error: "Could not unassign the code. Please try again." };
  revalidateItem(itemId);
  return { code: data ?? null };
}

export type CodeItemMatch = {
  id: string;
  description: string;
  size: string | null;
  numberedCode: string | null;
};

/**
 * Items a free code can go on, for the tag page's "Assign to an item": in
 * stock (not distributed, retired or lost), matching the description.
 */
export async function searchItemsForCodeAction(
  query: string,
): Promise<{ data: CodeItemMatch[] } | { error: string }> {
  const guard = await manageGuard("You must be signed in to search items.");
  if ("error" in guard) return guard;

  const term = query
    .trim()
    .replace(/[%_,()]/g, " ")
    .trim();
  if (term.length < 2) return { data: [] };

  const { data, error } = await guard.supabase
    .from("inventory_items")
    .select("id, description, size")
    .not("status", "in", "(distributed,retired,lost)")
    .ilike("description", `%${term}%`)
    .order("description")
    .limit(10);
  if (error) return { error: "Could not search items. Please try again." };

  const ids = (data ?? []).map((item) => item.id);
  const { data: tags } = ids.length
    ? await guard.supabase
        .from("inventory_item_tags")
        .select("item_id, value")
        .eq("kind", "numbered")
        .in("item_id", ids)
    : { data: [] };
  const codeByItem = new Map(
    (tags ?? []).map((tag) => [tag.item_id, tag.value]),
  );

  return {
    data: (data ?? []).map((item) => ({
      ...item,
      numberedCode: codeByItem.get(item.id) ?? null,
    })),
  };
}
