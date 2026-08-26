import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Support Chatter | Chatter Snow",
};

export default function SupportPage() {
  return (
    <div className="space-y-12">
      <section>
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Support Chatter
        </h1>
        <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
          Chatter relies on donations, sponsorships, and gear to keep our
          programs running and accessible.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <Link href="/support/donations" className="hover:underline">
                Donations
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="app-muted text-sm leading-relaxed">
              Support Chatter with a monetary or in-kind donation. Learn what we
              accept and how your contribution helps make snow sports more
              accessible.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <Link href="/support/sponsorship" className="hover:underline">
                Sponsorship
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="app-muted text-sm leading-relaxed">
              Partner with Chatter through cash, in-kind, or combined support
              for events, mountain days, and access programs.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
