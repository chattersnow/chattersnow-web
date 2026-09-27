import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { InventoryItem } from "./inventory-shared";

type BaseItem = Omit<
  InventoryItem,
  "assetTag" | "numberedCode" | "holdRequester" | "holdNotes" | "holdRequest"
>;

type Hold = {
  requester: NonNullable<InventoryItem["holdRequester"]>;
  notes: string | null;
  request: InventoryItem["holdRequest"];
};

/**
 * Adds what the items view can't carry to each row: its asset-tag code
 * (#1420), the reusable numbered code it holds now (#1444), and, for a reserved item, who holds it (#721, #1032). Shared by the
 * items list and the item page (#1441), so the two read them the same way.
 */
export async function withTagsAndHolds(
  supabase: SupabaseClient<Database>,
  items: BaseItem[],
): Promise<InventoryItem[]> {
  if (items.length === 0) return [];

  const reservedIds = items
    .filter((item) => item.status === "reserved")
    .map((item) => item.id);

  const holdByItemId = new Map<string, Hold>();
  if (reservedIds.length > 0) {
    // The request header (#1032) carries the notes and the delivery choice;
    // a hold from before the header existed still has its notes on the
    // movement, so both are read and the header wins.
    const { data: movements } = await supabase
      .from("inventory_movements")
      .select(
        "inventory_item_id, occurred_at, notes, recipient:people(id, name, email, phone), gear_request:gear_requests(id, status, delivery_method, quoted_amount, notes)",
      )
      .eq("movement_type", "reserved")
      .in("inventory_item_id", reservedIds)
      .order("occurred_at", { ascending: false });

    type HoldMovement = {
      inventory_item_id: string;
      occurred_at: string;
      notes: string | null;
      recipient: NonNullable<InventoryItem["holdRequester"]> | null;
      gear_request:
        | (NonNullable<InventoryItem["holdRequest"]> & {
            notes: string | null;
          })
        | null;
    };

    for (const movement of (movements ?? []) as unknown as HoldMovement[]) {
      if (movement.recipient && !holdByItemId.has(movement.inventory_item_id)) {
        holdByItemId.set(movement.inventory_item_id, {
          requester: movement.recipient,
          notes: movement.gear_request?.notes ?? movement.notes,
          request: movement.gear_request
            ? {
                id: movement.gear_request.id,
                status: movement.gear_request.status,
                delivery_method: movement.gear_request.delivery_method,
                quoted_amount: movement.gear_request.quoted_amount,
              }
            : null,
        });
      }
    }
  }

  // Read beside the view rather than embedded in it, because PostgREST embeds
  // through a foreign key, and a view has none.
  const assetTagByItemId = new Map<string, string>();
  const numberedByItemId = new Map<string, string>();
  const { data: tags } = await supabase
    .from("inventory_item_tags")
    .select("item_id, kind, value")
    .in("kind", ["asset_tag", "numbered"])
    .in(
      "item_id",
      items.map((item) => item.id),
    );
  for (const tag of tags ?? []) {
    if (!tag.item_id) continue;
    (tag.kind === "numbered" ? numberedByItemId : assetTagByItemId).set(
      tag.item_id,
      tag.value,
    );
  }

  return items.map((item) => {
    const hold = holdByItemId.get(item.id);
    return {
      ...item,
      assetTag: assetTagByItemId.get(item.id) ?? null,
      numberedCode: numberedByItemId.get(item.id) ?? null,
      holdRequester: hold?.requester ?? null,
      holdNotes: hold?.notes ?? null,
      holdRequest: hold?.request ?? null,
    };
  });
}
