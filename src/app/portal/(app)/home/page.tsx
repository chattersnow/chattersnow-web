import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PortalHomePage() {
  const supabase = await createSupabaseServerClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const startOfYear = new Date(startOfMonth.getFullYear(), 0, 1);

  const nowIso = new Date().toISOString();
  const startOfMonthDate = startOfMonth.toISOString().slice(0, 10);
  const startOfYearDate = startOfYear.toISOString().slice(0, 10);

  const [
    { count: gearAvailable },
    { count: donationsThisMonth },
    { count: upcomingEvents },
    { data: expensesThisYear },
    { data: expensesThisMonth },
  ] = await Promise.all([
    supabase
      .from("inventory_items")
      .select("*", { count: "exact", head: true })
      .eq("status", "available"),
    supabase
      .from("donations")
      .select("*", { count: "exact", head: true })
      .gte("created_at", startOfMonth.toISOString()),
    supabase
      .from("events")
      .select("*", { count: "exact", head: true })
      .gte("starts_at", nowIso),
    supabase.from("event_expenses").select("amount").gte("expense_date", startOfYearDate),
    supabase.from("event_expenses").select("amount").gte("expense_date", startOfMonthDate),
  ]);

  const sumAmounts = (rows: { amount: number }[] | null) =>
    (rows ?? []).reduce((total, row) => total + row.amount, 0);

  const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });

  return (
    <section>
      <p className="app-muted text-sm font-semibold uppercase tracking-[0.16em]">Overview</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">Upcoming events</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="brand-display text-4xl font-semibold tracking-[-0.04em]">
              {upcomingEvents ?? 0}
            </p>
            <p className="app-muted mt-2 text-sm">Events will appear here</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">Gear available</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="brand-display text-4xl font-semibold tracking-[-0.04em]">
              {gearAvailable ?? 0}
            </p>
            <p className="app-muted mt-2 text-sm">From recorded donations</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">
              Donations this month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="brand-display text-4xl font-semibold tracking-[-0.04em]">
              {donationsThisMonth ?? 0}
            </p>
            <p className="app-muted mt-2 text-sm">Donations recorded this month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="brand-display text-4xl font-semibold tracking-[-0.04em]">
              {currencyFormatter.format(sumAmounts(expensesThisMonth))}
            </p>
            <p className="app-muted mt-2 text-sm">
              This month · {currencyFormatter.format(sumAmounts(expensesThisYear))} this year
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}