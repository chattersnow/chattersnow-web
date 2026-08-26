import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Attend | Chatter Snow",
};

export default function AttendPage() {
  return (
    <main className="app-shell px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-6xl space-y-12">
        <section>
          <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Get involved
          </h1>
          <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
            Chatter runs on people showing up in whatever way works for them —
            on the mountain, behind the scenes, or by helping us grow.
          </p>
        </section>
        <section>
          <h2 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Attend
          </h2>
          <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
            The easiest way to get involved is to show up. Browse upcoming
            mountain days and community meetups and come ride with us.
          </p>
          <Button
            className="mt-4"
            nativeButton={false}
            render={<Link href="/events" />}
          >
            See upcoming events
          </Button>
        </section>

        <section id="community">
          <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            Join the community
          </h2>
          <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
            Follow along, meet other members, and hear about events first on
            Instagram{" "}
            <a
              href="https://www.instagram.com/chattersnow"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-foreground"
            >
              @chattersnow
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
