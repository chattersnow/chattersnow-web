import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * The in-progress, scanned distribution (#1420 part 3). One per person per
 * event context, kept server-side so a tag opened in another tab -- an iPhone
 * NFC tap lands in a new Safari tab -- can be added to it. RLS keeps a draft
 * to its owner; every function here runs under the caller's session.
 */

type Client = SupabaseClient<Database>;

export type DraftItem = {
  id: string;
  description: string;
  size: string | null;
  status: string;
  intendedUse: string;
};

export type DistributionDraft = {
  eventId: string | null;
  eventName: string | null;
  updatedAt: string;
  items: DraftItem[];
};

/** A draft untouched for longer than this is not offered by the resolver:
 *  it was left behind, not in progress. */
export const DRAFT_IN_PROGRESS_MS = 12 * 60 * 60 * 1000;

/**
 * Whether an item can go out in a distribution as scanned, and if not, why.
 * Mirrors what record_event_distribution() and the item picker allow: a
 * reserved item is fair game (fulfilling a gear request), and only gear-library
 * stock is offered for a handout.
 */
export function scanWarning(item: {
  status: string;
  intendedUse: string;
}): string | null {
  if (item.status === "distributed") return "Already distributed.";
  if (item.status === "retired") return "Retired.";
  if (item.status !== "available" && item.status !== "reserved")
    return `Not available (${item.status.replace(/_/g, " ")}).`;
  if (item.intendedUse !== "gear_library")
    return "Not gear-library stock, so not for a handout.";
  return null;
}

const DRAFT_SELECT =
  "event_id, updated_at, event:events!inventory_distribution_drafts_event_in_tenant(name), items:inventory_distribution_draft_items(created_at, item:inventory_items!inventory_distribution_draft_items_item_in_tenant(id, description, size, status, intended_use))";

type DraftRow = {
  event_id: string | null;
  updated_at: string;
  event: { name: string } | null;
  items: {
    created_at: string;
    item: {
      id: string;
      description: string;
      size: string | null;
      status: string;
      intended_use: string;
    } | null;
  }[];
};

function toDraft(row: DraftRow): DistributionDraft {
  return {
    eventId: row.event_id,
    eventName: row.event?.name ?? null,
    updatedAt: row.updated_at,
    items: [...row.items]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .flatMap(({ item }) =>
        item
          ? [
              {
                id: item.id,
                description: item.description,
                size: item.size,
                status: item.status,
                intendedUse: item.intended_use,
              },
            ]
          : [],
      ),
  };
}

/** The caller's draft for an event (or for no event), or null. */
export async function getDistributionDraft(
  supabase: Client,
  eventId: string | null,
): Promise<{ draft: DistributionDraft | null; error: boolean }> {
  let query = supabase
    .from("inventory_distribution_drafts")
    .select(DRAFT_SELECT);
  query = eventId ? query.eq("event_id", eventId) : query.is("event_id", null);
  const { data, error } = await query.maybeSingle();
  if (error) return { draft: null, error: true };
  return {
    draft: data ? toDraft(data as unknown as DraftRow) : null,
    error: false,
  };
}

/**
 * The draft the caller touched last, if it is still in progress -- the one a
 * tag opened from outside the app offers to add to.
 */
export async function getCurrentDistributionDraft(
  supabase: Client,
  now: number = Date.now(),
): Promise<DistributionDraft | null> {
  const { data, error } = await supabase
    .from("inventory_distribution_drafts")
    .select(DRAFT_SELECT)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const draft = toDraft(data as unknown as DraftRow);
  if (now - new Date(draft.updatedAt).getTime() > DRAFT_IN_PROGRESS_MS)
    return null;
  return draft;
}

export async function addToDistributionDraft(
  supabase: Client,
  itemId: string,
  eventId: string | null,
): Promise<{ error: boolean }> {
  const { error } = await supabase.rpc("add_to_distribution_draft", {
    p_item_id: itemId,
    ...(eventId ? { p_event_id: eventId } : {}),
  });
  return { error: Boolean(error) };
}

/** Where the list a draft belongs to is worked on. */
export function distributionDraftHref(eventId: string | null): string {
  return eventId
    ? `/portal/events/${encodeURIComponent(eventId)}?tab=distributions`
    : "/portal/inventory/distribution";
}
