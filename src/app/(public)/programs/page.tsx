import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Programs | Chatter Snow",
};

type Program = {
  emoji: string;
  name: string;
  description: React.ReactNode;
};

type Pillar = {
  label: string;
  description: string;
  programs: Program[];
};

const PILLARS: Pillar[] = [
  {
    label: "Access",
    description: "Get on the mountain.",
    programs: [
      {
        emoji: "🎿",
        name: "Beginner / Learn-to-Ski & Snowboard",
        description:
          "Beginner-friendly sessions designed to make getting started in skiing and snowboarding less intimidating. Participants can connect with experienced riders, get support on the snow, and build confidence in a welcoming LGBTQ+ community.",
      },
      {
        emoji: "🧤",
        name: "Gear Access",
        description: (
          <>
            We collect and redistribute donated ski and snowboard equipment to
            help make snow sports more accessible. See what&apos;s currently
            available on our{" "}
            <Link
              href="/gears"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Gear page
            </Link>
            .
          </>
        ),
      },
    ],
  },
  {
    label: "Progression",
    description: "Find your people, build your skills.",
    programs: [
      {
        emoji: "🤝",
        name: "Mentorship",
        description:
          "Connect newer riders with experienced Chatter members for guidance, encouragement, and someone to ride with. From navigating your first mountain day to improving your skills, no one has to figure it out alone.",
      },
      {
        emoji: "📋",
        name: "Future Clinics",
        description:
          "We're exploring skill-focused clinics, including park and progression sessions, for riders looking to push themselves. Details and dates are still being worked out.",
      },
    ],
  },
  {
    label: "Community",
    description: "Keep riding, keep connecting.",
    programs: [
      {
        emoji: "🌈",
        name: "Community Meetups",
        description:
          "Off-snow gatherings that keep the community connected year-round, including Pride events, social meetups, outdoor activities, and collaborations with LGBTQ+ and outdoor organizations.",
      },
      {
        emoji: "🏔️",
        name: "Mountain Days",
        description:
          "Group days at mountains across the East Coast where the focus is community as much as riding. Chatter provides a central gathering point, organized groups, and opportunities to meet other LGBTQ+ skiers and snowboarders.",
      },
      {
        emoji: "🔁",
        name: "Gear Drives / Swaps",
        description: (
          <>
            Periodic drives and swap events where members can donate, trade, and
            pick up gear in person. Learn more about donating on our{" "}
            <Link
              href="/gears/donate#donate"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Gear page
            </Link>
            .
          </>
        ),
      },
      {
        emoji: "🤝",
        name: "Partnerships",
        description: (
          <>
            We work with mountains, gear brands, and other organizations to make
            events more affordable and accessible. Interested in partnering with
            Chatter? Visit{" "}
            <Link
              href="/get-involved"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Get Involved
            </Link>
            .
          </>
        ),
      },
    ],
  },
];

export default function ProgramsPage() {
  return (
    <main className="app-shell px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-6xl space-y-12">
        <section className="mx-auto max-w-3xl">
          <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Programs
          </h1>
          <p className="app-muted mt-4 text-sm leading-relaxed sm:text-base">
            Get access. Find your people. Learn and progress. Keep riding.
            Everything Chatter runs falls under one of three simple pillars —
            and new programs can grow within them without changing the story.
          </p>
        </section>

        {PILLARS.map((pillar) => (
          <section key={pillar.label}>
            <div className="mx-auto max-w-3xl">
              <h2 className="app-eyebrow">{pillar.label}</h2>
              <p className="app-muted mt-2 text-sm leading-relaxed sm:text-base">
                {pillar.description}
              </p>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
              {pillar.programs.map((program) => (
                <Card key={program.name}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <span aria-hidden>{program.emoji}</span>
                      {program.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="app-muted text-sm leading-relaxed">
                      {program.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
