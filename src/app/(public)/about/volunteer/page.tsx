import type { Metadata } from "next";
import { Camera, HandHeart, Mountain } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Volunteer | Chatter Snow",
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

export default function VolunteerPage() {
  return (
    <div>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Volunteer opportunities
      </h1>
      <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
        Chatter runs on volunteers. Here are some of the ways you can get
        involved.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
    </div>
  );
}
