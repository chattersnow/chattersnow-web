import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RevenueTable } from "./revenue-table";
import { NewRevenueDialog } from "./new-revenue-dialog";
import {
  REVENUE_COLUMNS,
  type EventOption,
  type RevenueRow,
} from "./revenue-shared";

export default async function RevenuePage() {
  const supabase = await createSupabaseServerClient();

  const [{ data: revenue }, { data: events }] = await Promise.all([
    supabase
      .from("event_revenue")
      .select(REVENUE_COLUMNS)
      .order("received_date", { ascending: false }),
    supabase
      .from("events")
      .select("id, name")
      .order("name", { ascending: true }),
  ]);

  const eventOptions = (events ?? []) as EventOption[];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Revenue
        </h1>
        <NewRevenueDialog events={eventOptions} />
      </div>

      <div className="mt-6 space-y-4">
        <RevenueTable
          revenue={(revenue ?? []) as unknown as RevenueRow[]}
          events={eventOptions}
        />
      </div>
    </>
  );
}
