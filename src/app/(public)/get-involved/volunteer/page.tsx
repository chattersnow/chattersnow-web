import type { Metadata } from "next";
import { Camera, HandHeart, Mountain } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VolunteerApplicationForm } from "../volunteer-application-form-fields";

export const metadata: Metadata = {
  title: "Volunteer | Chatter Snow",
};

const OPPORTUNITIES = [
  [
    Mountain,
    "On-Snow Mentor",
    "Ride alongside newer skiers or snowboarders, offering guidance and encouragement on the mountain.",
  ],
  [
    Camera,
    "Photographer / Videographer",
    "Capture events and meetups to help tell Chatter's story and grow the community.",
  ],
  [
    HandHeart,
    "Donations & Collection",
    "Help collect and organize donated gear during events and drives.",
  ],
] as const;

export default function VolunteerPage() {
  return (
    <main className="app-shell px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-6xl">
        <section>
          <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Volunteer
          </h1>
          <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
            Chatter runs on volunteers. Here are some of the ways you can get
            involved.
          </p>
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {OPPORTUNITIES.map(([Icon, name, description]) => (
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
          <div className="mt-10 max-w-xl">
            <h2 className="brand-display text-xl font-semibold tracking-[-0.02em]">
              Apply to volunteer
            </h2>
            <p className="app-muted mt-2 text-sm leading-relaxed">
              Tell us a bit about yourself and we&apos;ll follow up about
              getting you plugged in.
            </p>
            <div className="mt-6">
              <VolunteerApplicationForm />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
