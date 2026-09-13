import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantBranding } from "@/lib/tenant-branding";
import { currentTenant, getTenantContext } from "@/lib/portal/tenants";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";
import { SALE_COLUMNS, type SaleRow } from "../../sales-shared";
import { buildReceipt, formatReceiptNumber } from "../../receipt";
import { SaleReceipt } from "./sale-receipt";

/**
 * A receipt for one recorded sale (#1016, §5.22).
 *
 * Under `finance/sales/layout.tsx`, so the gate is `sales:view` and nothing
 * more: reading a receipt is reading the ledger. RLS does the tenant half --
 * another tenant's sale id selects no row, and this is a `notFound()` rather
 * than a "not allowed", which is the answer that leaks least.
 *
 * Nothing is stored. The receipt is rendered from the sale's own snapshotted
 * lines every time it is asked for, so one reprinted next year is the same
 * receipt -- and there is no file for the app to hold, which it does not do
 * (`docs/technical-spec.md` §2).
 */
async function loadSale(saleId: string): Promise<SaleRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("sales")
    .select(SALE_COLUMNS)
    .eq("id", saleId)
    .order("id", { referencedTable: "sale_line_items", ascending: true })
    .maybeSingle();
  return (data as unknown as SaleRow) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ saleId: string }>;
}): Promise<Metadata> {
  const { saleId } = await params;
  const sale = await loadSale(saleId);
  return {
    title: sale
      ? `Receipt ${formatReceiptNumber(sale.receipt_number)}`
      : "Receipt",
  };
}

export default async function SaleReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ saleId: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const [{ saleId }, { print }] = await Promise.all([params, searchParams]);

  const supabase = await createSupabaseServerClient();
  const [sale, tenantContext, branding] = await Promise.all([
    loadSale(saleId),
    getTenantContext(supabase),
    getTenantBranding(supabase),
  ]);

  if (!sale) notFound();

  const model = buildReceipt(sale, {
    // The tenant's own name, never a literal: this page is served to every
    // organization on the platform.
    name: currentTenant(tenantContext)?.name ?? "",
    logoUrl: branding.logoUrl,
  });

  return (
    <>
      <PortalBreadcrumbs current={`Receipt ${model.receiptNumber}`} />
      <Card className="mt-4 print:border-0 print:shadow-none">
        <CardContent>
          {/* `?print=1` is the register's one-tap link: the cashier is already
              reaching for the printer, so the dialog opens itself. */}
          <SaleReceipt model={model} autoPrint={print === "1"} />
        </CardContent>
      </Card>
    </>
  );
}
