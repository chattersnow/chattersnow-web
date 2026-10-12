"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import { getRequestHost } from "@/lib/request-origin";
import { getInventoryTagPrefix, parseScannedTag } from "@/lib/inventory-tags";
import {
  MAX_LABEL_ITEMS,
  NUMBERED_CODES_PATH,
  type NumberRange,
} from "@/lib/inventory-labels";
import {
  codeQueryArgs,
  formatCount,
  isRetireReason,
  parseCodeFilters,
  parseTagIds,
  summarizeItemTagRetire,
  type CodeTarget,
  type ItemTagRetireSummary,
} from "@/lib/inventory-codes";

/**
 * Reusable numbered codes (#1444) and the Codes page (#1450). Generating,
 * assigning and retiring are inventory:manage; marking a code written to NFC
 * and reading its history are inventory:view, the same bar as reprinting its
 * label. Each function re-checks its grant: these gates only give a
 * friendlier refusal.
 */

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type Guard = { error: string } | { supabase: ServerClient };

async function manageGuard(message: string): Promise<Guard> {
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

async function viewGuard(message: string): Promise<Guard> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(supabase, message);
  if ("error" in userResult) return { error: userResult.error };
  const permissionError = await checkPermission(supabase, "inventory", "view");
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

/**
 * Numbered codes only (#1541): intake leaves an item with nothing scanned
 * untagged instead of giving it a random code, and no new random code can be
 * made. The database refuses it without a prefix.
 */
export async function setNumberedCodesOnlyAction(
  on: boolean,
): Promise<{ numberedOnly: boolean } | { error: string }> {
  const guard = await manageGuard(
    "You must be signed in to change how items are labelled.",
  );
  if ("error" in guard) return guard;

  const { data, error } = await guard.supabase.rpc(
    "set_inventory_numbered_codes_only",
    { p_on: on },
  );
  if (error) {
    if (error.message === "INVENTORY_TAG_PREFIX_MISSING") {
      return { error: "Set the prefix before using numbered codes only." };
    }
    return { error: "Could not save the setting. Please try again." };
  }
  revalidatePath(NUMBERED_CODES_PATH);
  revalidatePath("/portal/inventory/items");
  revalidatePath("/portal/inventory/donations");
  return { numberedOnly: data ?? on };
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
  | {
      outcome: "assigned" | "already";
      code: string;
      /** The item's random codes retired with it (#1544), when asked. */
      retiredTagCodes: string[];
      /** Set when the code went on but its tag code could not be retired. */
      retireError?: string;
    }
  | {
      outcome: "held";
      code: string;
      holder: { id: string; description: string };
    }
  | { error: string };

/**
 * Puts the numbered code in hand on an item. A code another item holds comes
 * back as `held`, with that item, and nothing changes until the caller asks
 * again with `move`. With `retireTagCode`, the item's random asset-tag code
 * is retired once the numbered code is on it (#1544), so the item is left
 * with one identity.
 */
export async function assignNumberedCodeAction(
  itemId: string,
  code: string,
  move = false,
  retireTagCode = false,
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
    case "already": {
      const retired = retireTagCode
        ? await retireItemTagCodes(guard.supabase, [itemId])
        : null;
      revalidateItem(itemId);
      return {
        outcome: row.outcome,
        code: row.code,
        retiredTagCodes:
          retired && !("error" in retired)
            ? retired.retired.map((tag) => tag.code)
            : [],
        ...(retired && "error" in retired
          ? { retireError: retired.error }
          : {}),
      };
    }
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
    case "retired":
      return {
        error: `${row.code} was retired because its tag was damaged or lost. Restore it on the Codes page if you found it.`,
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

/**
 * The tag ids an action on the Codes page means: the rows chosen, or every
 * code the filters match. "All matching" is re-read here under the caller's
 * RLS rather than trusted from the browser, and is capped at one print run,
 * so a filter that has grown since the page loaded is refused rather than
 * acted on in part.
 */
async function resolveTarget(
  supabase: ServerClient,
  target: CodeTarget,
): Promise<{ ids: string[] } | { error: string }> {
  if ("ids" in target) {
    const ids = parseTagIds(target.ids);
    return ids.length > 0 ? { ids } : { error: "Choose at least one code." };
  }
  const filters = parseCodeFilters(
    Object.fromEntries(new URLSearchParams(target.filter)),
  );
  const prefix = await getInventoryTagPrefix(supabase);
  const { data, error } = await supabase.rpc("inventory_tag_codes", {
    ...codeQueryArgs(filters, prefix),
    p_limit: MAX_LABEL_ITEMS + 1,
    p_offset: 0,
  });
  if (error) return { error: "Could not read the codes. Please try again." };
  const rows = data ?? [];
  if (rows.length === 0) return { error: "No codes match the filters." };
  if (rows.length > MAX_LABEL_ITEMS) {
    return {
      error: `${formatCount(Number(rows[0].total_count), "code")} match. Narrow the filters to ${MAX_LABEL_ITEMS} or fewer.`,
    };
  }
  return { ids: rows.map((row) => row.id) };
}

/**
 * Marks codes as written to NFC tags, or takes the mark back (#1450). The
 * iPhone's way: its tags are written in another app, so the person says so
 * here.
 */
export async function setNfcWrittenAction(
  target: CodeTarget,
  written = true,
): Promise<{ updated: number } | { error: string }> {
  const guard = await viewGuard("You must be signed in to mark NFC tags.");
  if ("error" in guard) return guard;
  const resolved = await resolveTarget(guard.supabase, target);
  if ("error" in resolved) return resolved;

  const { data, error } = await guard.supabase.rpc(
    "set_inventory_tags_nfc_written",
    { p_tag_ids: resolved.ids, p_written: written },
  );
  if (error) return { error: "Could not save that. Please try again." };
  revalidatePath(NUMBERED_CODES_PATH);
  return { updated: data ?? 0 };
}

/**
 * After a successful Web NFC write on Android (#1450): the page knows the
 * code it wrote, not the tag's id.
 */
export async function recordNfcWrittenAction(
  code: string,
): Promise<{ updated: number } | { error: string }> {
  const guard = await viewGuard("You must be signed in to mark NFC tags.");
  if ("error" in guard) return guard;

  const { data: tag } = await guard.supabase
    .from("inventory_item_tags")
    .select("id")
    .in("kind", ["asset_tag", "numbered"])
    .eq("value", code.trim().toUpperCase())
    .maybeSingle();
  if (!tag) return { updated: 0 };
  return setNfcWrittenAction({ ids: [tag.id] });
}

export type RetireResult = {
  retired: number;
  /** Codes taken off an item as they were retired. */
  released: { code: string; description: string }[];
  /**
   * Codes left as they are because each is the only code on its item
   * (#1544). Retired only when the caller asks again with `allowLast`.
   */
  lastTag: { tagId: string; code: string; description: string }[];
};

/**
 * Retires codes whose physical tag is damaged or lost (#1450), or an item's
 * random code replaced by a numbered one (#1544). A code on an item comes off
 * it -- unless it is the item's last code, which is left alone and returned
 * in `lastTag` until the caller confirms with `allowLast`.
 */
export async function retireCodesAction(
  target: CodeTarget,
  reason: string,
  note: string,
  allowLast = false,
): Promise<RetireResult | { error: string }> {
  const guard = await manageGuard("You must be signed in to retire codes.");
  if ("error" in guard) return guard;
  if (!isRetireReason(reason)) return { error: "Choose why it is retired." };
  if (note.trim().length > 500) {
    return { error: "Keep the note to 500 characters." };
  }
  const resolved = await resolveTarget(guard.supabase, target);
  if ("error" in resolved) return resolved;

  const { data, error } = await guard.supabase.rpc("retire_inventory_tags", {
    p_tag_ids: resolved.ids,
    p_reason: reason,
    p_note: note.trim() || null,
    p_allow_last: allowLast,
  });
  if (error) return { error: "Could not retire the codes. Please try again." };

  const rows = data ?? [];
  revalidateItem();
  return {
    retired: rows.filter((row) => row.outcome === "retired").length,
    released: rows.flatMap((row) =>
      row.outcome === "retired" && row.released_from
        ? [{ code: row.code, description: row.released_from }]
        : [],
    ),
    lastTag: rows.flatMap((row) =>
      row.outcome === "last_tag"
        ? [
            {
              tagId: row.tag_id,
              code: row.code,
              description: row.released_from ?? "",
            },
          ]
        : [],
    ),
  };
}

async function retireItemTagCodes(
  supabase: ServerClient,
  itemIds: string[],
): Promise<ItemTagRetireSummary | { error: string }> {
  const { data, error } = await supabase.rpc("retire_item_asset_tag_codes", {
    p_item_ids: itemIds,
    p_reason: "replaced",
  });
  if (error) {
    return { error: "Could not retire the tag codes. Please try again." };
  }
  return summarizeItemTagRetire(data ?? []);
}

/**
 * The Items list's bulk action (#1544): retires the random asset-tag code on
 * each selected item that has a numbered code. An item without one is
 * skipped, so nothing is left untagged; the database decides, not the
 * selection the browser sent.
 */
export async function retireItemTagCodesAction(
  itemIds: string[],
): Promise<ItemTagRetireSummary | { error: string }> {
  const guard = await manageGuard("You must be signed in to retire codes.");
  if ("error" in guard) return guard;
  // Item ids are uuids too, and a selection is capped like a print run.
  const ids = parseTagIds(itemIds);
  if (ids.length === 0) return { error: "Choose at least one item." };

  const result = await retireItemTagCodes(guard.supabase, ids);
  if ("error" in result) return result;
  revalidateItem();
  return result;
}

/** "Found it", or a mistake: the code is free (or blank) again. */
export async function unretireCodeAction(
  tagId: string,
): Promise<{ code: string } | { error: string }> {
  const guard = await manageGuard("You must be signed in to restore codes.");
  if ("error" in guard) return guard;
  const [id] = parseTagIds([tagId]);
  if (!id) return { error: "That code could not be found." };

  const { data, error } = await guard.supabase.rpc("unretire_inventory_tag", {
    p_tag_id: id,
  });
  if (error) return { error: "Could not restore the code. Please try again." };
  if (!data) return { error: "That code is not retired." };
  revalidatePath(NUMBERED_CODES_PATH);
  return { code: data };
}

export type CodeHistoryEntry = {
  occurredAt: string;
  event: string;
  itemId: string | null;
  itemDescription: string | null;
  detail: string | null;
  actorName: string | null;
};

/** One code's history, newest first (#1450). */
export async function codeHistoryAction(
  tagId: string,
): Promise<{ data: CodeHistoryEntry[] } | { error: string }> {
  const guard = await viewGuard("You must be signed in to read history.");
  if ("error" in guard) return guard;
  const [id] = parseTagIds([tagId]);
  if (!id) return { data: [] };

  const { data, error } = await guard.supabase.rpc("inventory_tag_history", {
    p_tag_id: id,
  });
  if (error) return { error: "Could not load the history. Please try again." };
  return {
    data: (data ?? []).map((row) => ({
      occurredAt: row.occurred_at,
      event: row.event,
      itemId: row.item_id,
      itemDescription: row.item_description,
      detail: row.detail,
      actorName: row.actor_name,
    })),
  };
}
