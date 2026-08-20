import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LogoutButton } from "../logout-button";
import { PortalTabs } from "../portal-tabs";
import { ExpensesTable } from "./expenses-table";
import type { EventOption, ExpenseRow } from "./expenses-shared";

export default async function ExpensesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/portal/login");
  }

  const [{ data: expenses }, { data: events }] = await Promise.all([
    supabase
      .from("event_expenses")
      .select(
        "id, event_id, description, expense_date, amount, currency, receipt_url, notes, events(name)"
      )
      .order("expense_date", { ascending: false }),
    supabase.from("events").select("id, name").order("name", { ascending: true }),
  ]);

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
            <div className="min-w-0">
              <Link
                href="/portal/home"
                className="app-muted text-xs font-semibold uppercase tracking-[0.16em] hover:text-foreground"
              >
                Operations portal
              </Link>
              <h1 className="brand-display whitespace-nowrap text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                Expenses
              </h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <LogoutButton />
          </div>
        </header>

        <PortalTabs />

        <div className="mt-10">
          <ExpensesTable
            expenses={(expenses ?? []) as unknown as ExpenseRow[]}
            events={(events ?? []) as EventOption[]}
          />
        </div>
      </div>
    </main>
  );
}
