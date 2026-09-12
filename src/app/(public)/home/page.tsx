import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSiteImageUrls } from "@/lib/site-images";
import { getPublicSite } from "@/lib/public-site";
import { isPageVisible } from "@/lib/page-visibility";
import { EVENT_ITEM_TYPE } from "@/lib/calendar-vocabulary";
import { nowMs } from "@/lib/time";
import { MAX_HOME_UPCOMING_COUNT, getSiteLayout } from "@/lib/site-layout";
import {
  HOME_COMMUNITY_ITEM_COLUMNS,
  HOME_UPCOMING_EVENT_COLUMNS,
  UpcomingEvents,
  type HomeCommunityItem,
  type HomeUpcomingEvent,
  type HomeUpcomingItem,
} from "./upcoming-events";
import { HomeCarousel } from "./home-carousel";
import { categoryLabel } from "../events/community/calendar-shared";
import type { PublicCalendarCategory } from "../events/community/calendar-shared";
import type { PublicEventProgram } from "../events/event-card";

const CAROUSEL_SLOTS = [
  "home_carousel_1",
  "home_carousel_2",
  "home_carousel_3",
] as const;

/** A calendar row before its category is resolved to the tenant's wording. */
type CalendarRow = Omit<HomeCommunityItem, "categoryLabel"> & {
  categories: string[] | null;
};

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const now = nowMs();
  const nowIso = new Date(now).toISOString();

  // "Hasn't finished yet", for both sources: an event still running today is
  // upcoming, and one with no end time counts until it starts.
  const stillUpcoming = `ends_at.gte.${nowIso},and(ends_at.is.null,starts_at.gte.${nowIso})`;

  // Both feeds are filtered and limited in Postgres rather than in JS. The
  // page used to read the whole public event list to use one row of it, which
  // is the shape that let PostgREST's `max_rows` silently truncate a calendar
  // read before (#755).
  const [
    { data: events },
    { data: calendarRows },
    { data: categories },
    siteImages,
    site,
    layout,
  ] = await Promise.all([
    supabase
      .from("public_events")
      .select(HOME_UPCOMING_EVENT_COLUMNS)
      .or(stillUpcoming)
      .order("starts_at", { ascending: true })
      .limit(MAX_HOME_UPCOMING_COUNT)
      .returns<Omit<HomeUpcomingEvent, "programs">[]>(),
    // `public_calendar_items` is a union of the calendar table and the events
    // table, so every published event is already in it as EVENT_ITEM_TYPE.
    // Without this filter the top-up prints the same event twice -- once as
    // its own card and once as somebody's community item (#846). The value is
    // imported rather than written out: this filter shipped with the literal
    // `chatter_event`, which #834 had renamed hours earlier, so it matched
    // every row and excluded none.
    supabase
      .from("public_calendar_items")
      .select(HOME_COMMUNITY_ITEM_COLUMNS)
      .neq("item_type", EVENT_ITEM_TYPE)
      .or(stillUpcoming)
      .order("starts_at", { ascending: true })
      .limit(MAX_HOME_UPCOMING_COUNT)
      .returns<CalendarRow[]>(),
    supabase
      .from("public_calendar_categories")
      .select("key, label")
      .returns<PublicCalendarCategory[]>(),
    getSiteImageUrls(supabase),
    getPublicSite(supabase),
    getSiteLayout(supabase),
  ]);
  const { content } = site;

  const [supportVisible, eventsVisible] = await Promise.all([
    isPageVisible("support"),
    isPageVisible("events"),
  ]);

  // Every destination in this section lives under the Events slot -- the
  // listing, the event pages, and the community calendar -- so when the board
  // hides that section the whole block goes with it rather than pointing at a
  // 404 (#586).
  //
  // Both feeds are queried at the largest count any tenant can pick and sliced
  // here, so reading the setting stays in the batch above rather than becoming
  // a round trip they have to wait on. The over-read is bounded by the
  // registry rather than by the size of either table.
  const ownEvents = eventsVisible
    ? (events ?? []).slice(0, layout.homeUpcomingCount)
    : [];

  // The community toggle governs the empty-state fallback as well as the
  // top-up: a tenant who switched community items off should not still meet
  // one on a week with nothing of their own.
  const communitySlots =
    eventsVisible && layout.homeUpcomingCommunity
      ? layout.homeUpcomingCount - ownEvents.length
      : 0;
  const communityItems: HomeCommunityItem[] = (calendarRows ?? [])
    .slice(0, Math.max(communitySlots, 0))
    .map(({ categories: itemCategories, ...item }) => ({
      ...item,
      categoryLabel: itemCategories?.[0]
        ? categoryLabel(categories ?? [], itemCategories[0])
        : null,
    }));

  // Second round trip rather than a join, and only for the handful of ids the
  // query above returned -- the events listing reads every program row because
  // it renders every event.
  const eventIds = ownEvents.map((event) => event.id);
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

  const upcoming: HomeUpcomingItem[] = [
    ...ownEvents.map((event): HomeUpcomingItem => ({
      kind: "event",
      event: { ...event, programs: programsByEvent.get(event.id) ?? [] },
    })),
    ...communityItems.map((item): HomeUpcomingItem => ({
      kind: "community",
      item,
    })),
  ].sort(
    (a, b) =>
      new Date(
        a.kind === "event" ? a.event.starts_at : a.item.starts_at,
      ).getTime() -
      new Date(
        b.kind === "event" ? b.event.starts_at : b.item.starts_at,
      ).getTime(),
  );

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
          <HomeCarousel
            slides={CAROUSEL_SLOTS.map((slot) => ({
              key: slot,
              url: siteImages[slot] ?? null,
            }))}
            alt={content.text("org.image_alt")}
          />

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
            items={upcoming}
            now={now}
            cards={layout.homeUpcomingCards}
            eyebrow={content.text("home.upcoming_eyebrow")}
            heading={content.text("home.upcoming_heading")}
            ctaLabel={content.text("home.upcoming_cta")}
            nextUpLabel={content.text("home.next_event_eyebrow")}
          />
        )}
      </div>
    </main>
  );
}
