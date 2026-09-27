import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * The in-progress, scanned distribution (#1420 part 3). One per person per
 * event context, kept server-side so a tag opened in another tab -- an iPhone
 * NFC tap lands in a new Safari tab -- can be added to it. RLS keeps a draft
 * to its owner; every function here runs under the caller's session.
 */

type Client = SupabaseClient<Database>;

/** Who a reserved piece is held for (#1443), from its latest hold. */
export type ItemHolder = { id: string; name: string | null };

export type DraftItem = {
  id: string;
  description: string;
  size: string | null;
  status: string;
  intendedUse: string;
  heldBy: ItemHolder | null;
};

export type DraftRecipient = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type DistributionDraft = {
  eventId: string | null;
  eventName: string | null;
  /** Stored on the draft (#1443), so a tag opened in another tab adds to the
   *  same person's handout. */
  recipient: DraftRecipient | null;
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
 * stock is offered for a handout. Once the distribution has a recipient, a
 * piece held for somebody else is kept off the list too (#1443), though
 * record_event_distribution() itself would not refuse it.
 */
export function scanWarning(
  item: {
    status: string;
    intendedUse: string;
    heldBy?: ItemHolder | null;
  },
  recipientId?: string | null,
): string | null {
  if (item.status === "distributed") return "Already distributed.";
  if (item.status === "retired") return "Retired.";
  if (item.status !== "available" && item.status !== "reserved")
    return `Not available (${item.status.replace(/_/g, " ")}).`;
  if (item.intendedUse !== "gear_library")
    return "Not gear-library stock, so not for a handout.";
  if (
    item.status === "reserved" &&
    item.heldBy &&
    recipientId &&
    item.heldBy.id !== recipientId
  )
    return `Held for ${item.heldBy.name ?? "someone else"}.`;
  return null;
}

/**
 * Who each reserved item is held for: the recipient of its latest hold, the
 * same reading as the item page's Hold card (item-extras.ts).
 */
export async function getItemHolders(
  supabase: Client,
  itemIds: string[],
): Promise<Map<string, ItemHolder>> {
  const holders = new Map<string, ItemHolder>();
  if (itemIds.length === 0) return holders;
  const { data } = await supabase
    .from("inventory_movements")
    .select("inventory_item_id, recipient:people(id, name)")
    .eq("movement_type", "reserved")
    .in("inventory_item_id", itemIds)
    .order("occurred_at", { ascending: false });
  for (const row of (data ?? []) as unknown as {
    inventory_item_id: string;
    recipient: ItemHolder | null;
  }[]) {
    if (row.recipient && !holders.has(row.inventory_item_id))
      holders.set(row.inventory_item_id, row.recipient);
  }
  return holders;
}

const DRAFT_SELECT =
  "event_id, updated_at, event:events!inventory_distribution_drafts_event_in_tenant(name), recipient:people!inventory_distribution_drafts_recipient_in_tenant(id, name, email, phone), items:inventory_distribution_draft_items(created_at, item:inventory_items!inventory_distribution_draft_items_item_in_tenant(id, description, size, status, intended_use))";

type DraftRow = {
  event_id: string | null;
  updated_at: string;
  event: { name: string } | null;
  recipient: DraftRecipient | null;
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

async function toDraft(
  supabase: Client,
  row: DraftRow,
): Promise<DistributionDraft> {
  const reservedIds = row.items.flatMap(({ item }) =>
    item?.status === "reserved" ? [item.id] : [],
  );
  const holders = await getItemHolders(supabase, reservedIds);
  return {
    eventId: row.event_id,
    eventName: row.event?.name ?? null,
    recipient: row.recipient,
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
                heldBy: holders.get(item.id) ?? null,
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
    draft: data ? await toDraft(supabase, data as unknown as DraftRow) : null,
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
  if (now - new Date(data.updated_at).getTime() > DRAFT_IN_PROGRESS_MS)
    return null;
  return toDraft(supabase, data as unknown as DraftRow);
}

/** How a draft is named to the person holding it: "the Spring Swap
 *  distribution for Jane Doe", "your distribution". */
export function draftListName(draft: {
  eventName: string | null;
  recipient: { name: string | null } | null;
}): string {
  const base = draft.eventName
    ? `the ${draft.eventName} distribution`
    : "your distribution";
  return draft.recipient?.name ? `${base} for ${draft.recipient.name}` : base;
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

/** Stores who the draft is for (null clears it), creating the draft if there
 *  is none yet. */
export async function setDistributionDraftRecipient(
  supabase: Client,
  eventId: string | null,
  personId: string | null,
): Promise<{ error: boolean }> {
  const { error } = await supabase.rpc("set_distribution_draft_recipient", {
    ...(eventId ? { p_event_id: eventId } : {}),
    ...(personId ? { p_person_id: personId } : {}),
  });
  return { error: Boolean(error) };
}

/** Moves the caller's draft from one event (or none) to another, merging it
 *  into a draft already there. */
export async function moveDistributionDraft(
  supabase: Client,
  fromEventId: string | null,
  toEventId: string | null,
): Promise<{ error: boolean }> {
  const { error } = await supabase.rpc("move_distribution_draft", {
    ...(fromEventId ? { p_from_event_id: fromEventId } : {}),
    ...(toEventId ? { p_to_event_id: toEventId } : {}),
  });
  return { error: Boolean(error) };
}

/** Where the list a draft belongs to is worked on. */
export function distributionDraftHref(eventId: string | null): string {
  return eventId
    ? `/portal/events/${encodeURIComponent(eventId)}?tab=distributions`
    : "/portal/inventory/distribution";
}
