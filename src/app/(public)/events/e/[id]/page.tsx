import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import { EventDetailContent } from "../../event-detail-content";
import { loadEventDetail } from "../../event-detail-data";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: event } = await supabase
    .from("public_events")
    .select("name")
    .eq("id", id)
    .maybeSingle();

  return {
    title: publicTitle(await getPublicSite(supabase), event?.name ?? "Event"),
  };
}

/**
 * The event's own page: what a card on the listing or the home page, a shared
 * link, a refresh and a search result all render (#1427).
 */
export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await loadEventDetail(id);

  if (!event) notFound();

  return (
    <PageShell>
      <EventDetailContent event={event} />
    </PageShell>
  );
}
