import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Donate | Chatter Snow",
};

const GEAR_EXAMPLES = [
  "Skis & snowboards",
  "Boots & bindings",
  "Outerwear (jackets, pants)",
  "Gloves & accessories",
];

export default function DonationsPage() {
  return (
    <div className="space-y-12">
      <section>
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Support Chatter
        </h1>
        <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
          Chatter relies on donations to keep our programs running and gear
          accessible. There are two ways to give.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Monetary donations</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="app-muted text-sm leading-relaxed">
              Online monetary donations are coming soon.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>In-kind donations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="app-muted text-sm leading-relaxed">
              We accept gently used gear, including:
            </p>
            <ul className="app-muted list-disc space-y-1 pl-5 text-sm leading-relaxed">
              {GEAR_EXAMPLES.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="app-muted text-sm leading-relaxed">
              Drop items off in person at any Chatter event, or contact us to
              arrange a drop-off, mail-in, or collection.
            </p>
            <Button nativeButton={false} render={<Link href="/contact" />}>
              Contact us to donate gear
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
