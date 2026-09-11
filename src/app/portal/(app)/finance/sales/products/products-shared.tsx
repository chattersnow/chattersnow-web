export type VariantRow = {
  id: string;
  product_id: string;
  label: string;
  sku: string | null;
  /** numeric(10,2) arrives from PostgREST as a string. */
  price: number | string;
  stock_on_hand: number;
  is_active: boolean;
  sort_order: number;
};

export type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  product_variants: VariantRow[];
};

export const PRODUCT_COLUMNS =
  "id, name, description, is_active, sort_order, " +
  "product_variants(id, product_id, label, sku, price, stock_on_hand, is_active, sort_order)";

/**
 * Variants in the order the product's own `sort_order` intends, ties broken by
 * label so "M" and "L" at the same weight do not swap places between renders.
 *
 * PostgREST orders an embedded resource only when the query asks it to, and
 * the request that feeds this page asks for products in one shot; sorting the
 * children here keeps that a single round trip.
 */
export function sortedVariants(product: ProductRow): VariantRow[] {
  return [...(product.product_variants ?? [])].sort(
    (a, b) =>
      a.sort_order - b.sort_order ||
      a.label.localeCompare(b.label, undefined, { numeric: true }),
  );
}

/** Stock across every variant — what the product row in the table reports. */
export function totalStock(product: ProductRow): number {
  return (product.product_variants ?? []).reduce(
    (sum, variant) => sum + variant.stock_on_hand,
    0,
  );
}
