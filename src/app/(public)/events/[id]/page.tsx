import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import { EventDetailContent } from "../event-detail-content";
import { loadEventDetail } from "../event-detail-data";

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
    title: publicTitle(
      await getPublicSite(supabase),
      event ? event.name : "Event",
    ),
  };
}

/**
 * The event's own page: what a shared link, a refresh or a search result
 * renders. A click from the listing gets the same content in a sheet through
 * the intercepting route in `@modal` (#847).
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
    <PageShell maxWidth="max-w-3xl">
      <EventDetailContent event={event} variant="page" />
    </PageShell>
  );
}
