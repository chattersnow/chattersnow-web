import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  STATUSES,
  StatusBadge,
  formatFaceValue,
} from "../items/inventory-shared";
import {
  summarizeByStatus,
  summarizeByType,
  sumMovementValue,
  type ValuationMovement,
} from "./valuation";
import { EmptyState } from "@/components/portal/empty-state";

type InventoryReportsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

export const metadata: Metadata = {
  title: "Inventory Reports",
};

export default async function InventoryReportsPage({
  searchParams,
}: InventoryReportsPageProps) {
  const supabase = await createSupabaseServerClient();

  const params = await searchParams;
  const raw = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const defaultFrom = toDateInput(startOfMonth);
  const defaultTo = toDateInput(new Date());

  const fromDate = raw("from") || defaultFrom;
  const toDate = raw("to") || defaultTo;

  const [{ data: items }, { data: movements }] = await Promise.all([
    supabase.from("inventory_items").select("type, status, face_value"),
    supabase
      .from("inventory_movements")
      .select(
        "movement_type, quantity, occurred_at, inventory_items(face_value)",
      )
      .in("movement_type", ["received", "distributed"])
      .gte("occurred_at", `${fromDate}T00:00:00.000Z`)
      .lte("occurred_at", `${toDate}T23:59:59.999Z`),
  ]);

  const byType = summarizeByType(items ?? []);
  const byStatus = summarizeByStatus(
    items ?? [],
    STATUSES.map((status) => status.value),
  );
  const onHand = byStatus.find((row) => row.status === "available");
  const valuationMovements = (movements ??
    []) as unknown as ValuationMovement[];
  const valueDonated = sumMovementValue(valuationMovements, "received");
  const valueDistributed = sumMovementValue(valuationMovements, "distributed");

  const hasCustomRange = fromDate !== defaultFrom || toDate !== defaultTo;

  const selectClassName =
    "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Inventory Reports
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">
              Total on-hand value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="brand-display text-4xl font-semibold tracking-[-0.04em]">
              {formatFaceValue(onHand?.totalValue ?? 0)}
            </p>
            <p className="app-muted mt-2 text-sm">Available inventory</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">
              Items on-hand
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="brand-display text-4xl font-semibold tracking-[-0.04em]">
              {onHand?.count ?? 0}
            </p>
            <p className="app-muted mt-2 text-sm">Available inventory</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">
              Value donated
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="brand-display text-4xl font-semibold tracking-[-0.04em]">
              {formatFaceValue(valueDonated)}
            </p>
            <p className="app-muted mt-2 text-sm">
              {fromDate} – {toDate}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">
              Value distributed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="brand-display text-4xl font-semibold tracking-[-0.04em]">
              {formatFaceValue(valueDistributed)}
            </p>
            <p className="app-muted mt-2 text-sm">
              {fromDate} – {toDate}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="rainbow-surface mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="from"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              From
            </label>
            <input
              id="from"
              name="from"
              type="date"
              defaultValue={fromDate}
              className={selectClassName}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="to"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              To
            </label>
            <input
              id="to"
              name="to"
              type="date"
              defaultValue={toDate}
              className={selectClassName}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="secondary">
              Filter
            </Button>
            {hasCustomRange && (
              <Button
                variant="ghost"
                nativeButton={false}
                render={<Link href="/portal/inventory/reports" />}
              >
                Reset to this month
              </Button>
            )}
          </div>
        </form>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>On-hand value by type</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {byType.length === 0 ? (
              <EmptyState
                className="py-4"
                title="No available inventory"
                description="On-hand value appears here once a donation is recorded under Inventory › Donations."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Total value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byType.map((row) => (
                    <TableRow key={row.type}>
                      <TableCell>{row.type}</TableCell>
                      <TableCell>{row.count}</TableCell>
                      <TableCell>{formatFaceValue(row.totalValue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inventory value by status</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Total value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byStatus.map((row) => (
                  <TableRow key={row.status}>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell>{row.count}</TableCell>
                    <TableCell>{formatFaceValue(row.totalValue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
