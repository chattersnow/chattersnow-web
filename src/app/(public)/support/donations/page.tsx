import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Donations | Chatter Snow",
};

export default function DonationsPage() {
  return (
    <main className="app-shell px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-6xl space-y-12">
        <section>
          <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Donations
          </h1>
          <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
            Donations help Chatter keep programs running and make skiing and
            snowboarding more accessible to LGBTQ+ riders.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Monetary donations</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="app-muted text-sm leading-relaxed">
                Online monetary donations are coming soon. Contributions will
                help fund accessible events, mountain days, and community
                programs.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>In-kind donations</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="app-muted text-sm leading-relaxed">
                We accept gently used ski and snowboard gear, which we
                redistribute through our gear program. See what we accept and
                how to donate on our{" "}
                <Link
                  href="/gears#donate"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  Gear page
                </Link>
                .
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
