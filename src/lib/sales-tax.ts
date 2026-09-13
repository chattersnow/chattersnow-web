import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The org's default sales tax rate, as a percent (#997).
 *
 * An org selling merchandise at an event collects tax and has to remit it.
 * The register prefills this rate on every sale and lets the cashier change
 * it per sale; `record_product_sale` computes the amount from the rate it is
 * sent and its own catalog-priced subtotal, and snapshots both on the row, so
 * a rate change here never rewrites a past receipt.
 *
 * Percent rather than a fraction (8.25, not 0.0825) because that is what a
 * cashier reads off a rate table, and what `sales.tax_rate` stores.
 *
 * Mirrors `fiscal-year.ts`: a setting key, a fallback, and one plain read per
 * render. No runtime imports beyond a type, for the same reason given there --
 * the register is a client component and may one day want the pure helpers.
 */

export const SALES_TAX_RATE_SETTING_KEY = "finance.sales_tax_rate";

/**
 * Applied when the setting can't be read. Zero is also what the migration
 * seeds: no tax is collected until an administrator says otherwise, and a
 * failed read must not invent a charge.
 */
export const DEFAULT_SALES_TAX_RATE = 0;

export const MAX_SALES_TAX_RATE = 100;

/** Whether a value is usable as a rate: finite and within 0-100 percent. */
export function isSalesTaxRate(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_SALES_TAX_RATE
  );
}

/**
 * Reads the org's default sales tax rate.
 *
 * Reads the `org_sales_tax` view rather than `app_settings` directly:
 * app_settings' select policy admits only six `manage` permissions, and a
 * `sales:manage` holder running the register may hold none of them. The view
 * hands out this one key without the approval thresholds beside it.
 */
export async function getSalesTaxRate(
  supabase: SupabaseClient,
): Promise<number> {
  const { data, error } = await supabase
    .from("org_sales_tax")
    .select("rate")
    .maybeSingle();

  // Falling back is right -- a register that opens at 0% beats one that
  // won't open -- but it must not be silent, for the reason fiscal-year.ts
  // gives: a swallowed PGRST205 once hid a missing view for weeks.
  if (error) {
    console.error(
      `[sales-tax] could not read org_sales_tax; falling back to ${DEFAULT_SALES_TAX_RATE}%`,
      error,
    );
  }

  // numeric arrives from PostgREST as a string.
  const rate = data?.rate === undefined ? undefined : Number(data.rate);
  return isSalesTaxRate(rate) ? rate : DEFAULT_SALES_TAX_RATE;
}
