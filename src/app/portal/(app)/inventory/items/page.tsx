import { createSupabaseServerClient } from "@/lib/supabase/server";
import { InventoryTable } from "./inventory-table";
import type { InventoryItem } from "./inventory-shared";

export default async function InventoryPage() {
  const supabase = await createSupabaseServerClient();

  const { data: items } = await supabase
    .from("inventory_items")
    .select(
      "id, description, type, size, gender, condition, face_value, status, photo_url, notes",
    )
    .order("created_at", { ascending: false });

  const reservedIds = (items ?? [])
    .filter((item) => item.status === "reserved")
    .map((item) => item.id);

  type HoldMovement = {
    inventory_item_id: string;
    occurred_at: string;
    recipient: NonNullable<InventoryItem["holdRequester"]> | null;
  };

  const holdByItemId = new Map<
    string,
    NonNullable<InventoryItem["holdRequester"]>
  >();
  if (reservedIds.length > 0) {
    const { data: movements } = await supabase
      .from("inventory_movements")
      .select(
        "inventory_item_id, occurred_at, recipient:people(id, name, email, phone)",
      )
      .eq("movement_type", "reserved")
      .in("inventory_item_id", reservedIds)
      .order("occurred_at", { ascending: false });

    for (const movement of (movements ?? []) as unknown as HoldMovement[]) {
      if (movement.recipient && !holdByItemId.has(movement.inventory_item_id)) {
        holdByItemId.set(movement.inventory_item_id, movement.recipient);
      }
    }
  }

  const itemsWithHolds: InventoryItem[] = (items ?? []).map((item) => ({
    ...item,
    holdRequester: holdByItemId.get(item.id) ?? null,
  }));

  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Inventory
      </h1>

      <div className="mt-6">
        <InventoryTable items={itemsWithHolds} />
      </div>
    </>
  );
}
