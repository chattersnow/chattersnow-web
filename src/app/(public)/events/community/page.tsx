import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { nowMs } from "@/lib/time";
import { CommunityCalendar } from "./community-calendar";

import { getPublicSite, publicTitle } from "@/lib/public-site";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return {
    title: publicTitle(await getPublicSite(supabase), "Community Calendar"),
  };
}

export default async function CommunityCalendarPage() {
  const supabase = await createSupabaseServerClient();

  const { content } = await getPublicSite(supabase);
  const { data: items } = await supabase
    .from("public_calendar_items")
    .select(
      "id, title, item_type, starts_at, ends_at, time_zone, summary, categories, public_url",
    )
    .order("starts_at", { ascending: true });

  return (
    <PageShell>
      <section>
        <div className="w-fit">
          <div className="rainbow-accent w-full" />
          <h1 className="brand-display mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            {content.text("events.community_heading")}
          </h1>
        </div>
        <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
          {content.text("events.community_intro")}
        </p>
      </section>

      <div className="mt-10">
        <CommunityCalendar items={items ?? []} now={nowMs()} />
      </div>
    </PageShell>
  );
}
