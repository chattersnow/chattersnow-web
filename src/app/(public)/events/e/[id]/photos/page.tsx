import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { hasPublicEventMedia } from "@/lib/public-event-gallery";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EventGallery } from "../../../event-gallery";
import { loadPublicEventMedia } from "../../../event-media-data";
import { publicEventPath } from "../../../event-path";

async function loadEventName(id: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("public_events")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  return data?.name ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const name = await loadEventName(id);
  return {
    title: publicTitle(
      await getPublicSite(await createSupabaseServerClient()),
      name ? `Photos from ${name}` : "Photos",
    ),
  };
}

/**
 * An event's whole public gallery (#1654), the link the event page, the
 * portal's Copy link and a photo album email can all point at. 404s unless the
 * event is public and published, the organization's Public event gallery is
 * on and something in it is public -- `public_event_media()` answers all three
 * with no rows.
 */
export default async function EventPhotosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const name = await loadEventName(id);
  if (!name) notFound();

  const media = await loadPublicEventMedia(id, null);
  if (!hasPublicEventMedia(media)) notFound();

  const eventHref = publicEventPath(id);

  return (
    <PageShell>
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/events" />}>
              Events
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbLink
              className="truncate"
              render={<Link href={eventHref} />}
            >
              {name}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Photos</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
        {name}
      </h1>
      <p className="mt-4 text-sm">
        <Link href={eventHref} className="underline underline-offset-4">
          Back to the event
        </Link>
      </p>

      <div className="mt-8">
        <EventGallery eventName={name} media={media} />
      </div>
    </PageShell>
  );
}
