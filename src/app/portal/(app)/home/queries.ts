import type { SupabaseClient } from "@supabase/supabase-js";

export type NextEvent = { id: string; name: string; starts_at: string; location: string | null };

export type UpcomingSummary = {
  nextEvent: NextEvent | null;
  registrationCount: number;
  volunteerCount: number;
  partnerCount: number;
};

type RegistrationRow = { party_size: number };
type LinkedEventRow = { id: string };

export async function getUpcomingSummary(
  supabase: SupabaseClient,
  nowIso: string
): Promise<UpcomingSummary> {
  const [{ data: nextEvents }, { data: registrations }, { data: volunteers }, { data: sponsors }] =
    await Promise.all([
      supabase
        .from("events")
        .select("id, name, starts_at, location")
        .gte("starts_at", nowIso)
        .order("starts_at", { ascending: true })
        .limit(1),
      supabase
        .from("event_registrations")
        .select("party_size, events!inner(starts_at)")
        .gte("events.starts_at", nowIso),
      supabase
        .from("event_volunteers")
        .select("id, events!inner(starts_at)")
        .gte("events.starts_at", nowIso),
      supabase
        .from("event_sponsors")
        .select("id, events!inner(starts_at)")
        .gte("events.starts_at", nowIso),
    ]);

  const registrationRows = (registrations ?? []) as unknown as RegistrationRow[];
  const volunteerRows = (volunteers ?? []) as unknown as LinkedEventRow[];
  const sponsorRows = (sponsors ?? []) as unknown as LinkedEventRow[];

  return {
    nextEvent: ((nextEvents ?? [])[0] as NextEvent | undefined) ?? null,
    registrationCount: registrationRows.reduce((total, row) => total + row.party_size, 0),
    volunteerCount: volunteerRows.length,
    partnerCount: sponsorRows.length,
  };
}

export type FinancialSummary = {
  expensesThisMonth: number;
  expensesThisYear: number;
  eventBudgetTotal: number;
};

export async function getFinancialSummary(
  supabase: SupabaseClient,
  startOfMonthDate: string,
  startOfYearDate: string,
  nowIso: string
): Promise<FinancialSummary> {
  const [{ data: expensesThisYear }, { data: expensesThisMonth }, { data: eventBudgets }] =
    await Promise.all([
      supabase.from("event_expenses").select("amount").gte("expense_date", startOfYearDate),
      supabase.from("event_expenses").select("amount").gte("expense_date", startOfMonthDate),
      supabase
        .from("events")
        .select("budget_amount")
        .eq("status", "published")
        .gte("starts_at", nowIso),
    ]);

  const sumAmounts = (rows: { amount: number }[] | null) =>
    (rows ?? []).reduce((total, row) => total + row.amount, 0);

  const eventBudgetTotal = ((eventBudgets ?? []) as { budget_amount: number | null }[]).reduce(
    (total, row) => total + (row.budget_amount ?? 0),
    0
  );

  return {
    expensesThisMonth: sumAmounts(expensesThisMonth),
    expensesThisYear: sumAmounts(expensesThisYear),
    eventBudgetTotal,
  };
}

export type InventorySummary = {
  totalItems: number;
  itemsAvailable: number;
  itemsDistributed: number;
  itemsNeedingAttention: number;
};

export async function getInventorySummary(supabase: SupabaseClient): Promise<InventorySummary> {
  const [
    { count: totalItems },
    { count: itemsAvailable },
    { count: itemsDistributed },
    { count: itemsNeedingAttention },
  ] = await Promise.all([
    supabase.from("inventory_items").select("*", { count: "exact", head: true }),
    supabase
      .from("inventory_items")
      .select("*", { count: "exact", head: true })
      .eq("status", "available"),
    supabase
      .from("inventory_items")
      .select("*", { count: "exact", head: true })
      .eq("status", "distributed"),
    supabase
      .from("inventory_items")
      .select("*", { count: "exact", head: true })
      .in("status", ["damaged", "lost"]),
  ]);

  return {
    totalItems: totalItems ?? 0,
    itemsAvailable: itemsAvailable ?? 0,
    itemsDistributed: itemsDistributed ?? 0,
    itemsNeedingAttention: itemsNeedingAttention ?? 0,
  };
}
