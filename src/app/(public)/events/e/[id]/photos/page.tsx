import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import {
  ListNavigationProvider,
  ListPendingRegion,
} from "@/components/portal/list-navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Pagination } from "@/components/ui/pagination";
import { parsePage, parsePerPage, totalPagesFor } from "@/lib/pagination";
import {
  PUBLIC_EVENT_PHOTO_PAGE_SIZES,
  hasPublicEventMedia,
} from "@/lib/public-event-gallery";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EventGallery } from "../../../event-gallery";
import { loadPublicEventMedia } from "../../../event-media-data";
import { publicEventPath, publicEventPhotosPath } from "../../../event-path";

/** `cache()`d: `generateMetadata` and the page both ask, once per request. */
const loadEventName = cache(async (id: string): Promise<string | null> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("public_events")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  return data?.name ?? null;
});

/** A gallery page's URL; page one and the default size stay off it. */
function photosPageHref(id: string, page: number, perPage: number): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (perPage !== PUBLIC_EVENT_PHOTO_PAGE_SIZES[0])
    params.set("perPage", String(perPage));
  const query = params.toString();
  return `${publicEventPhotosPath(id)}${query ? `?${query}` : ""}`;
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
 *
 * One page of photos at a time (#1683), `?page=` and `?perPage=` in the URL;
 * videos show with the first page. A page past the end goes to the last one.
 */
export default async function EventPhotosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; perPage?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const name = await loadEventName(id);
  if (!name) notFound();

  const page = parsePage(query.page);
  const perPage = parsePerPage(query.perPage, PUBLIC_EVENT_PHOTO_PAGE_SIZES);
  const media = await loadPublicEventMedia(id, {
    offset: (page - 1) * perPage,
    limit: perPage,
  });
  const totalPages = totalPagesFor(media.photoCount, perPage);
  if (page > totalPages) redirect(photosPageHref(id, totalPages, perPage));
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

      <ListNavigationProvider className="mt-8">
        <ListPendingRegion>
          <EventGallery
            eventName={name}
            media={media}
            pager={
              media.photoCount > PUBLIC_EVENT_PHOTO_PAGE_SIZES[0] && (
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  hrefFor={(next) => photosPageHref(id, next, perPage)}
                  count={media.photoCount}
                  pageSize={perPage}
                  perPageHrefFor={(next) => photosPageHref(id, 1, next)}
                  perPageOptions={PUBLIC_EVENT_PHOTO_PAGE_SIZES}
                  perPageLabel="Photos per page"
                />
              )
            }
          />
        </ListPendingRegion>
      </ListNavigationProvider>
    </PageShell>
  );
}
