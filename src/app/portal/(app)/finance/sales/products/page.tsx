import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { NewProductDialog } from "./new-product-dialog";
import { ProductsTable } from "./products-table";
import { PRODUCT_COLUMNS, type ProductRow } from "./products-shared";

export const metadata: Metadata = {
  title: "Products",
};

export default async function SalesProductsPage() {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "sales", "manage");

  // Variants embedded rather than fetched separately: one round trip, and the
  // sub-list in every table row needs all of them anyway.
  const { data: products } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Products
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <div className="mt-6 space-y-4">
        <ProductsTable
          products={(products ?? []) as unknown as ProductRow[]}
          canManage={canManage}
          action={canManage ? <NewProductDialog /> : undefined}
        />
      </div>
    </>
  );
}
