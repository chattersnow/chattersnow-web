import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { nowMs } from "@/lib/time";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function Home() {
  const supabase = await createSupabaseServerClient();

  const { data: events } = await supabase
    .from("public_events")
    .select("id, name, location, starts_at, ends_at")
    .order("starts_at", { ascending: true });

  const now = nowMs();
  const nextEvent = (events ?? []).find(
    (event) => new Date(event.ends_at ?? event.starts_at).getTime() >= now,
  );

  return (
    <main className="app-shell px-6 py-10 sm:px-10">
      <div className="mx-auto max-w-3xl">
        <section className="flex flex-col items-center text-center">
          <div className="relative aspect-square w-[min(60vw,14rem)]">
            <Image
              src="/chatter-logo-transparent.png"
              alt="Chatter Snow logo"
              width={224}
              height={224}
              priority
              className="h-full w-full object-contain"
            />
          </div>

          <div className="rainbow-accent mt-6 w-32" />

          <h1 className="brand-display mt-6 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            A queer ski &amp; snowboard community
          </h1>
          <p className="app-muted mt-4 max-w-xl text-sm leading-relaxed sm:text-base">
            Chatter brings LGBTQ+ skiers and snowboarders together on and off
            the East Coast mountains, and works to make snow sports more
            accessible through gear, mentorship, and community.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button nativeButton={false} render={<Link href="/events" />}>
              Join an event
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/get-involved" />}
            >
              Get involved
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/support" />}
            >
              Donate
            </Button>
          </div>
        </section>

        {nextEvent && (
          <section className="mt-16 rounded-xl border border-[var(--line)] p-6 text-center sm:p-8">
            <span className="app-eyebrow">Next up</span>
            <h2 className="brand-display mt-2 text-xl font-semibold tracking-[-0.02em] sm:text-2xl">
              {nextEvent.name}
            </h2>
            <p className="app-muted mt-2 text-sm">
              {dateFormatter.format(new Date(nextEvent.starts_at))}
              {nextEvent.location && ` · ${nextEvent.location}`}
            </p>
            <Button
              variant="outline"
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
