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
          <div className="app-muted mt-4 max-w-3xl space-y-4 text-sm leading-relaxed sm:text-base">
            <p>
              Sponsors help fund the core of what Chatter does: subsidizing
              mountain days, keeping gear access programs running, and making
              events more affordable for LGBTQ+ riders who might not
              otherwise be able to join.
            </p>
            <p>
              We&apos;re building out sponsorship tiers and benefits (event
              branding, gear partnerships, and community recognition among
              them) — if your business or organization is interested in
              supporting Chatter, reach out and we&apos;ll work out what
              makes sense together.
            </p>
          </div>
          <Button
            variant="outline"
            className="mt-4"
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
            We accept gently used ski and snowboard gear, which we
            redistribute through our gear program. See what we accept and how
            to donate on our{" "}
            <Link href="/gears#donate" className="underline underline-offset-4 hover:text-foreground">
              Gear page
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
