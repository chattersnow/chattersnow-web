import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { nowMs } from "@/lib/time";
import { CommunityCalendar } from "./community-calendar";

export const metadata: Metadata = {
  title: "Community Calendar | Chatter Snow",
};

export default async function CommunityCalendarPage() {
  const supabase = await createSupabaseServerClient();

  const { data: items } = await supabase
    .from("public_calendar_items")
    .select(
      "id, title, item_type, starts_at, ends_at, time_zone, summary, categories, public_url",
    )
    .order("starts_at", { ascending: true });

  return (
    <main className="app-shell px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-6xl">
        <section className="mx-auto max-w-3xl">
          <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Community Calendar
          </h1>
          <p className="app-muted mt-4 text-sm leading-relaxed sm:text-base">
            Chatter-hosted events are marked as such. Other entries are
            community observances, seasonal moments, and campaigns Chatter is
            highlighting — not events Chatter hosts or organizes.
          </p>
        </section>

        <div className="mt-10">
          <CommunityCalendar items={items ?? []} now={nowMs()} />
        </div>
      </div>
    </main>
  );
}
