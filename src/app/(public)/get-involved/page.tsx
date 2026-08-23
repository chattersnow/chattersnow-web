import type { Metadata } from "next";
import Link from "next/link";
import { Camera, HandHeart, Mountain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Get Involved | Chatter Snow",
};

type Opportunity = {
  icon: typeof Mountain;
  name: string;
  description: string;
};

const OPPORTUNITIES: Opportunity[] = [
  {
    icon: Mountain,
    name: "On-Snow Mentor",
    description:
      "Ride alongside newer skiers or snowboarders, offering guidance and encouragement on the mountain.",
  },
  {
    icon: Camera,
    name: "Photographer / Videographer",
    description:
      "Capture events and meetups to help tell Chatter's story and grow the community.",
  },
  {
    icon: HandHeart,
    name: "Donations & Collection",
    description:
      "Help collect and organize donated gear during events and drives.",
  },
];

export default function GetInvolvedPage() {
  return (
    <main className="app-shell px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-6xl space-y-16">
        <section>
          <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Get involved
          </h1>
          <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
            Chatter runs on people showing up in whatever way works for them
            — on the mountain, behind the scenes, or by helping us grow.
          </p>
        </section>

        <section>
          <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            Attend
          </h2>
          <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
            The easiest way to get involved is to show up. Browse upcoming
            mountain days and community meetups and come ride with us.
          </p>
          <Button className="mt-4" nativeButton={false} render={<Link href="/events" />}>
            See upcoming events
          </Button>
        </section>

        <section id="volunteer">
          <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            Volunteer
          </h2>
          <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
            Chatter runs on volunteers. Here are some of the ways you can get
            involved.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {OPPORTUNITIES.map(({ icon: Icon, name, description }) => (
              <Card key={name}>
                <CardHeader>
                  <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-muted ring-1 ring-foreground/10">
                    <Icon className="size-12 text-muted-foreground/50" />
                  </div>
                </CardHeader>
                <CardContent>
                  <CardTitle>{name}</CardTitle>
                  <p className="app-muted mt-2 text-sm leading-relaxed">
                    {description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            Become a partner
          </h2>
          <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
            We work with mountains, gear brands, and other organizations to
            make events more affordable and accessible for our community. If
            your organization wants to partner with Chatter on an event,
            discount, or collaboration, we&apos;d love to hear from you.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            nativeButton={false}
            render={<Link href="/contact?topic=partnership" />}
          >
            Start a conversation
          </Button>
        </section>

        <section>
          <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            Sponsor Chatter
          </h2>
          <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
            Sponsorships help fund events, gear, and programs. See sponsorship
            details on our{" "}
            <Link href="/support#sponsorship" className="underline underline-offset-4 hover:text-foreground">
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
            Have gear you&apos;re not using? Donating it helps another rider
            get on the mountain. See what we accept on our{" "}
            <Link href="/gears#donate" className="underline underline-offset-4 hover:text-foreground">
              Gear page
            </Link>
            .
          </p>
        </section>

        <section>
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
