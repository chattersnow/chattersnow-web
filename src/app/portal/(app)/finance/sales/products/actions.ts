"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission, type PermissionDenied } from "@/lib/auth/permissions";
import { friendlyError } from "@/lib/db-errors";
import { parseProductForm } from "./product-form";
import { parseStockValue, parseVariantForm } from "./variant-form";

export type ProductActionResult = { error: string } | { success: true };

/**
 * Every write here invalidates three routes, not one. Part 2 puts the register
 * and the ledger on the same catalog, and a price or a stock count that moved
 * has to be right on all three the moment it changes -- a cashier reading a
 * stale price off a cached register page is a wrong receipt, not a stale view.
 * The two part-2 paths do not exist yet; naming them now means the day they
 * land is not the day someone remembers this list.
 */
const REVALIDATED_PATHS = [
  "/portal/finance/sales/products",
  "/portal/finance/sales/register",
  "/portal/finance/sales/ledger",
];

function revalidateSales() {
  for (const path of REVALIDATED_PATHS) revalidatePath(path);
}

/**
 * The gate every action below opens with. It hands back the client as well as
 * the verdict so a caller does not build a second one, and keeps `denied` a
 * nullable field rather than a discriminated union -- `"denied" in gate` does
 * not narrow an inferred union whose members carry the other key as optional.
 */
async function requireManage(): Promise<{
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  denied: PermissionDenied | null;
}> {
  const supabase = await createSupabaseServerClient();
  return {
    supabase,
    denied: await checkPermission(supabase, "sales", "manage"),
  };
}

// A variant whose product has been sold cannot be removed -- the restrict
// foreign key from sale_line_items is what says so, and it is deliberate:
// deleting it would destroy the priced history the finance rollup reads.
const SOLD_VARIANT_MESSAGE =
  "This variant has been sold; deactivate it instead.";

export async function createProductAction(
  formData: FormData,
): Promise<ProductActionResult> {
  const gate = await requireManage();
  if (gate.denied) return gate.denied;

  const product = parseProductForm(formData);
  if ("error" in product) return product;
  // The dialog creates the product and its first variant together: a product
  // with no variant has no price and no stock, so it is not yet sellable and
  // there is nothing useful to look at.
  //
  // Both parsers read `sortOrder` and `isActive`, and one submission carries
  // one of each. They belong to the product -- the dialog does not offer the
  // variant its own -- so the variant parser gets a copy without them and
  // falls back to its own defaults rather than inheriting a product's
  // sort_order of 30 or its inactive state.
  const variantFields = new FormData();
  for (const [key, value] of formData.entries()) {
    if (key === "sortOrder" || key === "isActive") continue;
    variantFields.append(key, value);
  }
  const variant = parseVariantForm(variantFields);
  if ("error" in variant) return variant;

  const { data: created, error } = await gate.supabase
    .from("products")
    .insert(product.data)
    .select("id")
    .single();

  if (error || !created) {
    return {
      error: friendlyError(
        error ?? {},
        "A product with this name already exists.",
        "Could not create the product. Please try again.",
      ),
    };
  }

  const { error: variantError } = await gate.supabase
    .from("product_variants")
    .insert({ ...variant.data, product_id: created.id });

  if (variantError) {
    // Two statements, no transaction: PostgREST has no way to span them. Undo
    // the product rather than leave a half-made one behind that the person
    // would have to notice and clean up themselves.
    await gate.supabase.from("products").delete().eq("id", created.id);
    return {
      error: friendlyError(
        variantError,
        "That SKU is already in use.",
        "Could not create the product. Please try again.",
      ),
    };
  }

  revalidateSales();
  return { success: true };
}

export async function updateProductAction(
  id: string,
  formData: FormData,
): Promise<ProductActionResult> {
  const gate = await requireManage();
  if (gate.denied) return gate.denied;

  const parsed = parseProductForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await gate.supabase
    .from("products")
    .update(parsed.data)
    .eq("id", id);

  if (error) {
    return {
      error: friendlyError(
        error,
        "A product with this name already exists.",
        "Could not save the product. Please try again.",
      ),
    };
  }

  revalidateSales();
  return { success: true };
}

export async function deleteProductAction(
  id: string,
): Promise<ProductActionResult> {
  const gate = await requireManage();
  if (gate.denied) return gate.denied;

  const { error } = await gate.supabase.from("products").delete().eq("id", id);

  if (error) {
    // 23503: a variant of this product is on a sale line. The cascade from
    // products to variants would have taken it, and the restrict from
    // sale_line_items refuses.
    if (error.code === "23503") {
      return {
        error:
          "This product has been sold; deactivate it instead — it keeps its sales history and disappears from the register.",
      };
    }
    return { error: "Could not delete the product. Please try again." };
  }

  revalidateSales();
  return { success: true };
}

export async function createVariantAction(
  productId: string,
  formData: FormData,
): Promise<ProductActionResult> {
  const gate = await requireManage();
  if (gate.denied) return gate.denied;

  const parsed = parseVariantForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await gate.supabase
    .from("product_variants")
    .insert({ ...parsed.data, product_id: productId });

  if (error) {
    return {
      error: friendlyError(
        error,
        "This product already has a variant with that name or SKU.",
        "Could not add the variant. Please try again.",
      ),
    };
  }

  revalidateSales();
  return { success: true };
}

export async function updateVariantAction(
  id: string,
  formData: FormData,
): Promise<ProductActionResult> {
  const gate = await requireManage();
  if (gate.denied) return gate.denied;

  const parsed = parseVariantForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await gate.supabase
    .from("product_variants")
    .update(parsed.data)
    .eq("id", id);

  if (error) {
    return {
      error: friendlyError(
        error,
        "This product already has a variant with that name or SKU.",
        "Could not save the variant. Please try again.",
      ),
    };
  }

  revalidateSales();
  return { success: true };
}

export async function deleteVariantAction(
  id: string,
): Promise<ProductActionResult> {
  const gate = await requireManage();
  if (gate.denied) return gate.denied;

  const { error } = await gate.supabase
    .from("product_variants")
    .delete()
    .eq("id", id);

  if (error) {
    if (error.code === "23503") return { error: SOLD_VARIANT_MESSAGE };
    return { error: "Could not delete the variant. Please try again." };
  }

  revalidateSales();
  return { success: true };
}

/**
 * Sets stock to an absolute figure rather than adjusting by a delta.
 *
 * This is a stock *take* -- someone has counted what is in the box. A delta
 * would be the right shape for a shipment arriving, which phase 1 does not
 * model; from part 2 on the only other thing that moves this number is a sale,
 * and that belongs to the RPC.
 */
export async function setVariantStockAction(
  id: string,
  stock: number,
): Promise<ProductActionResult> {
  const gate = await requireManage();
  if (gate.denied) return gate.denied;

  const parsed = parseStockValue(String(stock));
  if ("error" in parsed) return parsed;

  const { error } = await gate.supabase
    .from("product_variants")
    .update({ stock_on_hand: parsed.data })
    .eq("id", id);

  if (error) return { error: "Could not update stock. Please try again." };

  revalidateSales();
  return { success: true };
}
