import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Support Chatter | Chatter Snow",
};

export default function SupportPage() {
  return (
    <main className="app-shell px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-6xl space-y-12">
        <section>
          <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Support Chatter
          </h1>
          <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
            Chatter relies on donations, sponsorships, and gear to keep our
            programs running and accessible.
          </p>
        </section>

        <section>
          <Card>
            <CardHeader>
              <CardTitle>Donations</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="app-muted text-sm leading-relaxed">
                Online monetary donations are coming soon.
              </p>
            </CardContent>
          </Card>
        </section>

        <section id="sponsorship">
          <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            Sponsorship
          </h2>
          <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
            Sponsors help fund the core of what Chatter does: subsidizing
            mountain days, keeping gear access programs running, and making
            events more affordable for LGBTQ+ riders who might not otherwise be
            able to join. In return, sponsors get real visibility with our
            community — event branding, recognition in event materials and on
            our website, and a direct line to a rider base that shows up for the
            brands that show up for them.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Cash sponsorship</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="app-muted text-sm leading-relaxed">
                  Underwrite an event, a season of mountain days, or a program
                  like our gear library. Cash sponsors are the easiest way to
                  keep events affordable and accessible.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>In-kind sponsorship</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="app-muted text-sm leading-relaxed">
                  Contribute gear, lift tickets, venue space, or services.
                  In-kind support stretches directly into gear drives, event day
                  logistics, and giveaways.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Both</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="app-muted text-sm leading-relaxed">
                  Many of our sponsors mix cash and in-kind support across a
                  season. We&apos;ll work with you to find a combination that
                  fits your organization.
                </p>
              </CardContent>
            </Card>
          </div>

          <Button
            variant="outline"
            className="mt-6"
            nativeButton={false}
            render={<Link href="/contact?topic=partnership" />}
          >
            Talk to us about sponsoring
          </Button>
        </section>

        <section id="in-kind">
          <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            In-kind donations
          </h2>
          <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
            We accept gently used ski and snowboard gear, which we redistribute
            through our gear program. See what we accept and how to donate on
            our{" "}
            <Link
              href="/gears#donate"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Gear page
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
