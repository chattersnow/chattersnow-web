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
import { isPageVisible } from "@/lib/page-visibility";
import { nowMs } from "@/lib/time";

const CAROUSEL_SLOTS = [
  "home_carousel_1",
  "home_carousel_2",
  "home_carousel_3",
] as const;

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function Home() {
  const supabase = await createSupabaseServerClient();

  const [{ data: events }, siteImages] = await Promise.all([
    supabase
      .from("public_events")
      .select("id, name, location, starts_at, ends_at")
      .order("starts_at", { ascending: true }),
    getSiteImageUrls(supabase),
  ]);

  const supportVisible = await isPageVisible("support");

  const now = nowMs();
  const nextEvent = (events ?? []).find(
    (event) => new Date(event.ends_at ?? event.starts_at).getTime() >= now,
  );

  return (
    <main className="app-shell px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-6xl">
        <section className="flex flex-col items-center text-center">
          <Carousel className="w-full max-w-5xl" opts={{ loop: true }}>
            <CarouselContent>
              {CAROUSEL_SLOTS.map((slot, index) => (
                <CarouselItem key={slot}>
                  <SiteImage
                    url={siteImages[slot] ?? null}
                    alt="Chatter Snow community"
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
              A queer ski &amp; snowboard community
            </h1>
          </div>
          <p className="app-muted mt-3 max-w-xl text-sm leading-relaxed sm:text-base">
            Chatter brings LGBTQ+ skiers and snowboarders together on and off
            the East Coast mountains, and works to make snow sports more
            accessible through gear, mentorship, and community.
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button
              variant="rainbow"
              nativeButton={false}
              render={<Link href="/events" />}
            >
              Join an event
            </Button>
            <Button
              variant="secondary"
              nativeButton={false}
              render={<Link href="/get-involved" />}
            >
              Get involved
            </Button>
            {supportVisible ? (
              <Button
                variant="secondary"
                nativeButton={false}
                render={<Link href="/support" />}
              >
                Donate
              </Button>
            ) : null}
          </div>
        </section>

        {nextEvent && (
          <section className="rainbow-surface mt-16 rounded-xl border border-[var(--line)] p-6 text-center shadow-md sm:p-8">
            <span className="app-eyebrow">Next up</span>
            <h2 className="brand-display mt-2 text-xl font-semibold tracking-[-0.02em] sm:text-2xl">
              {nextEvent.name}
            </h2>
            <p className="app-muted mt-2 text-sm">
              {dateFormatter.format(new Date(nextEvent.starts_at))}
              {nextEvent.location && ` · ${nextEvent.location}`}
            </p>
            <Button
              variant="secondary"
              className="mt-4"
              nativeButton={false}
              render={<Link href="/events" />}
            >
              See event details
            </Button>
          </section>
        )}
      </div>
    </main>
  );
}
