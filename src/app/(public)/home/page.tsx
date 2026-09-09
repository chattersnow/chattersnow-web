import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { SiteImage } from "@/components/site-image";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSiteImageUrls } from "@/lib/site-images";
import { getPublicSite } from "@/lib/public-site";
import { isPageVisible } from "@/lib/page-visibility";
import { formatDateTimeInZone, nowMs } from "@/lib/time";
import {
  HOME_UPCOMING_EVENT_COLUMNS,
  UpcomingEvents,
  type HomeUpcomingEvent,
} from "./upcoming-events";
import { MAX_HOME_UPCOMING_COUNT, getSiteLayout } from "@/lib/site-layout";
import type { PublicEventProgram } from "../events/event-card";

const CAROUSEL_SLOTS = [
  "home_carousel_1",
  "home_carousel_2",
  "home_carousel_3",
] as const;

const ITEM_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

/**
 * The community calendar item shown when the organization has nothing of its
 * own upcoming, so the section doesn't vanish between events (#823).
 */
type NextUp = {
  title: string;
  meta: string;
  href: string;
  ctaLabel: string;
  /** A calendar item's public_url can be someone else's site. */
  external: boolean;
};

/**
 * The soonest community calendar item that hasn't finished yet. Filtered and
 * limited in Postgres rather than in JS: the calendar is unbounded and
 * PostgREST caps rows at `max_rows`, which silently truncated a calendar read
 * before (#755).
 */
async function nextCalendarItem(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  now: number,
): Promise<NextUp | null> {
  const nowIso = new Date(now).toISOString();
  const { data } = await supabase
    .from("public_calendar_items")
    .select("id, title, starts_at, time_zone, public_url")
    .or(`ends_at.gte.${nowIso},and(ends_at.is.null,starts_at.gte.${nowIso})`)
    .order("starts_at", { ascending: true })
    .limit(1);

  const item = data?.[0];
  if (!item) return null;

  return {
    title: item.title,
    meta: formatDateTimeInZone(
      item.starts_at,
      item.time_zone,
      ITEM_DATE_FORMAT,
    ),
    href: item.public_url ?? "/events/community",
    ctaLabel: item.public_url ? "Learn more" : "See the community calendar",
    external: /^https?:\/\//i.test(item.public_url ?? ""),
  };
}

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const now = nowMs();
  const nowIso = new Date(now).toISOString();

  // Filtered and limited in Postgres rather than in JS. This used to read the
  // whole public event list to use one row of it, which is both wasteful and
  // the shape that let PostgREST's `max_rows` silently truncate a calendar
  // read before (#755).
  const [{ data: events }, siteImages, site, layout] = await Promise.all([
    supabase
      .from("public_events")
      .select(HOME_UPCOMING_EVENT_COLUMNS)
      .or(`ends_at.gte.${nowIso},and(ends_at.is.null,starts_at.gte.${nowIso})`)
      .order("starts_at", { ascending: true })
      .limit(MAX_HOME_UPCOMING_COUNT)
      .returns<Omit<HomeUpcomingEvent, "programs">[]>(),
    getSiteImageUrls(supabase),
    getPublicSite(supabase),
    getSiteLayout(supabase),
  ]);
  const { content } = site;

  // Queried at the largest count any tenant can pick and sliced here, so
  // reading the setting stays in the batch above rather than becoming a round
  // trip the event query has to wait on. The over-read is at most a handful of
  // rows, and bounded by the registry rather than by the size of the table.
  const visibleEvents = (events ?? []).slice(0, layout.homeUpcomingCount);

  const [supportVisible, eventsVisible] = await Promise.all([
    isPageVisible("support"),
    isPageVisible("events"),
  ]);

  // Second round trip rather than a join, and only for the handful of ids the
  // query above returned -- the events listing reads every program row because
  // it renders every event.
  const eventIds = eventsVisible ? visibleEvents.map((event) => event.id) : [];
  const { data: programRows } =
    eventIds.length > 0
      ? await supabase
          .from("public_event_programs")
          .select("event_id, program_id, name")
          .in("event_id", eventIds)
          .returns<(PublicEventProgram & { event_id: string })[]>()
      : { data: [] };

  const programsByEvent = new Map<string, PublicEventProgram[]>();
  for (const { event_id, ...program } of programRows ?? []) {
    programsByEvent.set(event_id, [
      ...(programsByEvent.get(event_id) ?? []),
      program,
    ]);
  }

  // Every destination in this section lives under the Events slot -- the
  // listing, the event pages, and the community calendar -- so when the board
  // hides that section the whole block goes with it rather than pointing at a
  // 404 (#586).
  const upcoming: HomeUpcomingEvent[] = eventsVisible
    ? visibleEvents.map((event) => ({
        ...event,
        programs: programsByEvent.get(event.id) ?? [],
      }))
    : [];

  const nextUp: NextUp | null =
    eventsVisible && upcoming.length === 0
      ? await nextCalendarItem(supabase, now)
      : null;

  return (
    // /home has no layout.tsx, so it has no PageShell ancestor -- it has to
    // carry the skip link target itself.
    <main
      id="main-content"
      tabIndex={-1}
      className="app-shell px-6 py-8 outline-none sm:px-10"
    >
      <div className="mx-auto max-w-6xl">
        <section className="flex flex-col items-center text-center">
          <Carousel className="w-full max-w-5xl" opts={{ loop: true }}>
            <CarouselContent>
              {CAROUSEL_SLOTS.map((slot, index) => (
                <CarouselItem key={slot}>
                  <SiteImage
                    url={siteImages[slot] ?? null}
                    alt={content.text("org.image_alt")}
                    className="aspect-[21/9] rounded-2xl"
                    sizes="(min-width: 1024px) 1024px, 100vw"
                    priority={index === 0}
                  />
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="hidden sm:flex" />
            <CarouselNext className="hidden sm:flex" />
          </Carousel>

          <div className="mt-5 w-fit">
            <div className="rainbow-accent w-full" />
            <h1 className="brand-display mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              {content.text("home.heading")}
            </h1>
          </div>
          <p className="app-muted mt-3 max-w-xl text-sm leading-relaxed sm:text-base">
            {content.text("home.intro")}
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button
              variant="rainbow"
              nativeButton={false}
              render={<Link href="/events" />}
            >
              {content.text("home.cta_events")}
            </Button>
            <Button
              variant="secondary"
              nativeButton={false}
              render={<Link href="/get-involved" />}
            >
              {content.text("home.cta_get_involved")}
            </Button>
            {supportVisible ? (
              <Button
                variant="secondary"
                nativeButton={false}
                render={<Link href="/support" />}
              >
                {content.text("home.cta_donate")}
              </Button>
            ) : null}
          </div>
        </section>

        {upcoming.length > 0 && (
          <UpcomingEvents
            events={upcoming}
            now={now}
            eyebrow={content.text("home.upcoming_eyebrow")}
            heading={content.text("home.upcoming_heading")}
            ctaLabel={content.text("home.upcoming_cta")}
            nextUpLabel={content.text("home.next_event_eyebrow")}
          />
        )}

        {nextUp && (
          <section className="rainbow-surface mt-16 rounded-xl border border-[var(--line)] p-6 text-center shadow-md sm:p-8">
            <span className="app-eyebrow">
              {content.text("home.next_event_eyebrow")}
            </span>
            <h2 className="brand-display mt-2 text-xl font-semibold tracking-[-0.02em] sm:text-2xl">
              {nextUp.title}
            </h2>
            <p className="app-muted mt-2 text-sm">{nextUp.meta}</p>
            <Button
              variant="secondary"
              className="mt-4"
              nativeButton={false}
              render={
                nextUp.external ? (
                  <a
                    href={nextUp.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${nextUp.ctaLabel} about ${nextUp.title} (opens in new tab)`}
                  />
                ) : (
                  <Link href={nextUp.href} />
                )
              }
            >
              {nextUp.ctaLabel}
            </Button>
          </section>
        )}
      </div>
    </main>
  );
}
