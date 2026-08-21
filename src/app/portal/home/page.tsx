import Image from "next/image";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoutButton } from "../logout-button";
import { PortalTabs } from "../portal-tabs";
import { NewEventDialog } from "../events/new-event-dialog";
import { AddDonationModal } from "./add-donation-modal";

export default async function PortalHomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/portal/login");
  }

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
    <main className="app-shell px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between gap-4 border-b border-[var(--line)] pb-6">
          <div className="flex min-w-0 items-center gap-3">
            <Image
              src="/chatter-logo-transparent.png"
              alt="Chatter Snow"
              width={150}
              height={200}
              className="h-14 w-auto shrink-0 sm:h-16"
              style={{ width: "auto" }}
              priority
            />
            <h1 className="brand-display whitespace-nowrap text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              Operations portal
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <LogoutButton />
          </div>
        </header>

        <PortalTabs />

        <section className="mt-10">
          <p className="app-muted text-sm font-semibold uppercase tracking-[0.16em]">
            Overview
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="app-muted text-sm font-semibold">
                  Upcoming events
                </CardTitle>
                <NewEventDialog />
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
                <CardTitle className="app-muted text-sm font-semibold">
                  Gear available
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="brand-display text-4xl font-semibold tracking-[-0.04em]">
                  {gearAvailable ?? 0}
                </p>
                <p className="app-muted mt-2 text-sm">From recorded donations</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="app-muted text-sm font-semibold">
                  Donations this month
                </CardTitle>
                <AddDonationModal />
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
      </div>
    </main>
  );
}