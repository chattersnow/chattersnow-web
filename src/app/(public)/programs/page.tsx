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
        name: "Learn to Ride",
        description:
          "Beginner-friendly sessions to make getting started in skiing and snowboarding less intimidating — orientation to gear, lifts, and mountain basics in a welcoming LGBTQ+ group setting.",
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
        name: "Ride Buddy",
        description:
          "Paired for the day with an experienced rider — not formal instruction, just someone to answer questions and ride alongside.",
      },
      {
        emoji: "🏂",
        name: "Progression & Park Riding",
        description:
          "Skill-focused sessions for riders looking to push themselves. From building confidence on the mountain to learning park fundamentals, we create supportive environments to progress alongside other riders.",
      },
    ],
  },
  {
    label: "Community",
    description: "Keep riding, keep connecting.",
    programs: [
      {
        emoji: "🏔️",
        name: "Mountain Meetups",
        description:
          "Group days at mountains across the East Coast where the focus is community as much as riding. Chatter provides a central gathering point, organized groups, and opportunities to meet other LGBTQ+ skiers and snowboarders.",
      },
      {
        emoji: "🌈",
        name: "Community Events",
        description:
          "Off-snow gatherings that keep the community connected year-round, including Pride events, social meetups, outdoor activities, gear swaps, and collaborations with LGBTQ+ and outdoor organizations.",
      },
    ],
  },
];

export default function ProgramsPage() {
  return (
    <div className="space-y-12">
      <section>
        <div className="rainbow-accent w-16" />
        <h1 className="brand-display mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Programs
        </h1>
        <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
          Get access. Find your people. Learn and progress. Keep riding.
        </p>
      </section>

      {PILLARS.map((pillar) => (
        <section key={pillar.label}>
          <h2 className="app-eyebrow">{pillar.label}</h2>
          <p className="app-muted mt-2 max-w-3xl text-sm leading-relaxed sm:text-base">
            {pillar.description}
          </p>

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
  );
}
