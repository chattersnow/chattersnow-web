import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ExpensesTable } from "./expenses-table";
import type { EventOption, ExpenseRow } from "./expenses-shared";

export default async function ExpensesPage() {
  const supabase = await createSupabaseServerClient();

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
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Expenses
      </h1>

      <div className="mt-6">
        <ExpensesTable
          expenses={(expenses ?? []) as unknown as ExpenseRow[]}
          events={(events ?? []) as EventOption[]}
        />
      </div>
    </>
  );
}
