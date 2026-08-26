import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Donate Gear | Chatter Snow",
};

const GEAR_EXAMPLES = [
  "Skis & snowboards",
  "Boots & bindings",
  "Outerwear (jackets, pants)",
  "Gloves & accessories",
];

export default function DonateGearPage() {
  return (
    <main className="app-shell px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-6xl space-y-12">
        <section id="how-it-works">
          <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            How the gear program works
          </h1>
          <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
            Chatter collects donated ski and snowboard gear and makes it
            available to community members who need it. Browse the library, then
            reach out to request an item. We&apos;ll help coordinate pickup or
            drop-off at an upcoming event.
          </p>
        </section>

        <section id="request">
          <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            Request gear
          </h2>
          <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
            See something in the library you need, or don&apos;t see your size?
            Send us a message and we&apos;ll do our best to match you with
            available gear.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            nativeButton={false}
            render={<Link href="/contact?topic=gear" />}
          >
            Request gear
          </Button>
        </section>

        <section id="donate">
          <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            Donate gear
          </h2>
          <Card className="mt-6 max-w-2xl">
            <CardHeader>
              <CardTitle>We accept gently used gear</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="app-muted list-disc space-y-1 pl-5 text-sm leading-relaxed">
                {GEAR_EXAMPLES.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="app-muted text-sm leading-relaxed">
                Drop items off in person at any Chatter event, or contact us to
                arrange a drop-off, mail-in, or collection.
              </p>
              <Button
                nativeButton={false}
                render={<Link href="/contact?topic=gear" />}
              >
                Contact us to donate gear
              </Button>
            </CardContent>
          </Card>
        </section>

        <section id="gear-drives">
          <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            Gear drives
          </h2>
          <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
            We periodically run gear drives and swap events where members can
            donate, trade, and pick up gear in person. See{" "}
            <Link
              href="/events"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Events
            </Link>{" "}
            for what&apos;s coming up.
          </p>
        </section>
      </div>
    </main>
  );
}
