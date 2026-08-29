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
  formatAmount,
  isRevenueSource,
  revenueSourceLabel,
} from "../revenue/revenue-shared";
import {
  computeFinanceSummary,
  SPEND_STATUSES,
  summarizeByEvent,
  summarizeRevenueBySource,
  summarizeSpendByStatus,
  yearToDateRange,
  type FinanceReportData,
} from "./summary";

type FinanceReportsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isDateInput(value: string | undefined): value is string {
  return (
    !!value && DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(value))
  );
}

const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const numberFormatter = new Intl.NumberFormat("en-US");

// event_revenue has no currency column and CURRENCIES is USD-only across
// Finance today, so every figure on this page is formatted as USD.
export default async function FinancialReportsPage({
  searchParams,
}: FinanceReportsPageProps) {
  const supabase = await createSupabaseServerClient();

  const params = await searchParams;
  const raw = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const defaults = yearToDateRange(new Date());
  const fromParam = raw("from");
  const toParam = raw("to");
  const fromDate = isDateInput(fromParam) ? fromParam : defaults.from;
  const toDate = isDateInput(toParam) ? toParam : defaults.to;

  // The RPC rejects an inverted range; catch it here so the reader gets a
  // sentence instead of a failed request.
  const rangeInverted = fromDate > toDate;

  let data: FinanceReportData | null = null;
  let loadError: string | null = null;

  if (!rangeInverted) {
    const { data: rpcData, error } = await supabase.rpc(
      "get_finance_report_data",
      { p_from: fromDate, p_to: toDate },
    );

    if (error) {
      loadError = "Could not load financial reports. Please try again.";
    } else {
      const result = (rpcData ?? {}) as Partial<FinanceReportData>;
      data = {
        revenue: result.revenue ?? [],
        expenses: result.expenses ?? [],
        reimbursements: result.reimbursements ?? [],
        in_kind_items: result.in_kind_items ?? [],
      };
    }
  }

  const summary = data ? computeFinanceSummary(data) : null;
  const revenueBySource = data ? summarizeRevenueBySource(data.revenue) : [];
  const expensesByStatus = data ? summarizeSpendByStatus(data.expenses) : [];
  const reimbursementsByStatus = data
    ? summarizeSpendByStatus(data.reimbursements)
    : [];
  const byEvent = data
    ? summarizeByEvent(data.revenue, [...data.expenses, ...data.reimbursements])
    : [];

  const hasCustomRange = fromDate !== defaults.from || toDate !== defaults.to;

  const summaryCards = summary
    ? [
        {
          label: "Income",
          value: formatAmount(summary.income),
          caption: "Event revenue received",
        },
        {
          label: "Expenses paid",
          value: formatAmount(summary.paidSpend),
          caption: "Expenses and reimbursements marked paid",
        },
        {
          label: "Net",
          value: formatAmount(summary.net),
          caption: "Income less expenses paid",
        },
        {
          label: "In-kind donations",
          value: formatAmount(summary.inKindValue),
          caption: `${numberFormatter.format(summary.inKindItemCount)} item${
            summary.inKindItemCount === 1 ? "" : "s"
          } donated, at face value`,
        },
      ]
    : [];

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="w-fit">
            <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              Financial Reports
            </h1>
            <div className="rainbow-accent mt-3 w-full" />
          </div>
          <p className="app-muted mt-3 max-w-2xl text-sm">
            Summary of income, expenses, and donations across the selected
            period, computed live from event revenue, expenses, reimbursements,
            and donation intake.
          </p>
        </div>
      </div>

      {rangeInverted ? (
        <Card className="mt-6">
          <CardContent className="app-muted px-4 py-6 text-sm">
            The <strong className="text-foreground">from</strong> date (
            {fromDate}) is after the{" "}
            <strong className="text-foreground">to</strong> date ({toDate}).
            Pick a range that starts before it ends.
          </CardContent>
        </Card>
      ) : loadError ? (
        <Card className="mt-6">
          <CardContent className="app-muted px-4 py-6 text-sm">
            {loadError}
          </CardContent>
        </Card>
      ) : summary ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {summaryCards.map((card) => (
            <Card key={card.label}>
              <CardHeader>
                <CardTitle className="app-muted text-sm font-semibold">
                  {card.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="brand-display text-4xl font-semibold tracking-[-0.04em]">
                  {card.value}
                </p>
                <p className="app-muted mt-2 text-sm">{card.caption}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <div className="rainbow-surface mt-6 rounded-xl border border-[var(--line)] p-4 shadow-md">
        <form
          method="get"
          className="flex flex-wrap items-end justify-end gap-3"
        >
          <div className="flex w-40 flex-col gap-1">
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

          <div className="flex w-40 flex-col gap-1">
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
                render={<Link href="/portal/finance/reports" />}
              >
                Reset to this year
              </Button>
            )}
          </div>
        </form>
      </div>

      {summary && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Income by source</CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                {revenueBySource.length === 0 ? (
                  <p className="app-muted px-4 text-sm">
                    No revenue recorded in this period.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Source</TableHead>
                        <TableHead>Records</TableHead>
                        <TableHead>Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {revenueBySource.map((row) => (
                        <TableRow key={row.source}>
                          <TableCell>
                            {isRevenueSource(row.source)
                              ? revenueSourceLabel(row.source)
                              : row.source}
                          </TableCell>
                          <TableCell>
                            {numberFormatter.format(row.count)}
                          </TableCell>
                          <TableCell>{formatAmount(row.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Spend by status</CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Expenses</TableHead>
                      <TableHead>Reimbursements</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {SPEND_STATUSES.map((status) => (
                      <TableRow key={status}>
                        <TableCell className="capitalize">{status}</TableCell>
                        <TableCell>
                          {formatAmount(
                            expensesByStatus.find(
                              (row) => row.status === status,
                            )?.total ?? 0,
                          )}
                        </TableCell>
                        <TableCell>
                          {formatAmount(
                            reimbursementsByStatus.find(
                              (row) => row.status === status,
                            )?.total ?? 0,
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Income and paid spend by event</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              {byEvent.length === 0 ? (
                <p className="app-muted px-4 text-sm">
                  Nothing recorded in this period.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Income</TableHead>
                      <TableHead>Paid spend</TableHead>
                      <TableHead>Net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byEvent.map((row) => (
                      <TableRow key={row.eventId ?? "no-event"}>
                        <TableCell className="whitespace-normal">
                          {row.eventName}
                        </TableCell>
                        <TableCell>{formatAmount(row.income)}</TableCell>
                        <TableCell>{formatAmount(row.paidSpend)}</TableCell>
                        <TableCell>{formatAmount(row.net)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
