import { createSupabaseServerClient } from "@/lib/supabase/server";
import { InventoryTable } from "./inventory-table";

export default async function InventoryPage() {
  const supabase = await createSupabaseServerClient();

  const { data: items } = await supabase
    .from("inventory_items")
    .select(
      "id, description, type, size, gender, condition, face_value, status, photo_url, notes"
    )
    .order("created_at", { ascending: false });

  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Inventory
      </h1>

      <div className="mt-6">
        <InventoryTable items={items ?? []} />
      </div>
    </>
  );
}
