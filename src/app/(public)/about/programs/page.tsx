import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Current Programs | Chatter Snow",
};

type Program = {
  emoji: string;
  name: string;
  description: string;
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
          "Beginner-friendly sessions designed to make getting started in skiing and snowboarding less intimidating. Participants can connect with experienced riders, get support on the snow, and build confidence in a welcoming LGBTQ+ community.",
      },
      {
        emoji: "🧤",
        name: "Gear Access",
        description:
          "We collect and redistribute donated ski and snowboard equipment to help make snow sports more accessible. Our goal is to reduce the financial barrier to getting on the mountain.",
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
          "Connect newer riders with experienced Chatter members for guidance, encouragement, and someone to ride with. From navigating your first mountain day to improving your skills, no one has to figure it out alone.",
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
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Current programs
        </h1>
        <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
          Get access. Find your people. Learn and progress. Keep riding.
          Everything Chatter runs falls under one of three simple pillars —
          and new programs can grow within them without changing the story.
        </p>
      </section>

      {PILLARS.map((pillar) => (
        <section key={pillar.label}>
          <span className="app-eyebrow">{pillar.label}</span>
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
