import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { SalesTable } from "./sales-table";
import { SALE_COLUMNS, type EventOption, type SaleRow } from "./sales-shared";

export const metadata: Metadata = {
  title: "Sales",
};

export default async function SalesPage() {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "sales", "manage");

  const [{ data: sales }, { data: events }] = await Promise.all([
    supabase
      .from("sales")
      .select(SALE_COLUMNS)
      // id breaks the tie, so two sales rung up in the same second keep a
      // stable order between renders -- the (sold_at desc, id) index.
      .order("sold_at", { ascending: false })
      .order("id", { ascending: true }),
    supabase.from("events").select("id, name").order("name"),
  ]);

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Sales
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <div className="mt-6 space-y-4">
        <SalesTable
          sales={(sales ?? []) as unknown as SaleRow[]}
          events={(events ?? []) as EventOption[]}
          canManage={canManage}
          // Both links go to `sales:manage` pages, so a view-only reader (a
          // future report-only role) gets the ledger and no dead ends.
          action={
            canManage ? (
              <>
                {/* nativeButton={false} on both: a Link renders an <a>, and
                    Base UI's Button logs a console error without it. */}
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/portal/finance/sales/products" />}
                >
                  Products
                </Button>
                <Button
                  nativeButton={false}
                  render={<Link href="/portal/finance/sales/register" />}
                >
                  Open register
                </Button>
              </>
            ) : undefined
          }
        />
      </div>
    </>
  );
}
