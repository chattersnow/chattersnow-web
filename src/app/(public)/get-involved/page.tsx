import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Get Involved | Chatter Snow",
};

export default function GetInvolvedPage() {
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

        <section className="grid gap-4 sm:grid-cols-3">
          <Button
            nativeButton={false}
            render={<Link href="/get-involved/attend" />}
          >
            Attend
          </Button>
          <Button
            nativeButton={false}
            render={<Link href="/get-involved/volunteer" />}
          >
            Volunteer
          </Button>
          <Button
            nativeButton={false}
            render={<Link href="/get-involved/partner" />}
          >
            Become a partner
          </Button>
        </section>

        <section>
          <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            Sponsor Chatter
          </h2>
          <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
            Sponsorships help fund events, gear, and programs. See sponsorship
            details on our{" "}
            <Link
              href="/support#sponsorship"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Support page
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            Donate gear
          </h2>
          <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
            Have gear you&apos;re not using? Donating it helps another rider get
            on the mountain. See what we accept on our{" "}
            <Link
              href="/gears/donate#donate"
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
