import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Sponsorship | Chatter Snow",
};

export default function SponsorshipPage() {
  return (
    <div className="space-y-12">
      <section>
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Sponsorship
        </h1>
        <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
          Sponsors help fund the core of what Chatter does: subsidizing mountain
          days, keeping gear access programs running, and making events more
          affordable for LGBTQ+ riders who might not otherwise be able to join.
          In return, sponsors get real visibility with our community — event
          branding, recognition in event materials and on our website, and a
          direct line to a rider base that shows up for the brands that show up
          for them.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Cash sponsorship</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="app-muted text-sm leading-relaxed">
              Underwrite an event, a season of mountain days, or a program like
              our gear library. Cash sponsors are the easiest way to keep events
              affordable and accessible.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>In-kind sponsorship</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="app-muted text-sm leading-relaxed">
              Contribute gear, lift tickets, venue space, or services. In-kind
              support stretches directly into gear drives, event day logistics,
              and giveaways.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Both</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="app-muted text-sm leading-relaxed">
              Many of our sponsors mix cash and in-kind support across a season.
              We&apos;ll work with you to find a combination that fits your
              organization.
            </p>
          </CardContent>
        </Card>
      </section>

      <Button
        variant="outline"
        nativeButton={false}
        render={<Link href="/contact?topic=partnership" />}
      >
        Talk to us about sponsoring
      </Button>
    </div>
  );
}
