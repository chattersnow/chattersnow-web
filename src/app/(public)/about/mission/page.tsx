import type { Metadata } from "next";
import { ImagePlaceholder } from "@/components/image-placeholder";

export const metadata: Metadata = {
  title: "Mission & Values | Chatter Snow",
};

const MISSION_POINTS = [
  "Building community through inclusive ski and snowboard events",
  "Improving access through gear donations, drives, and swaps",
  "Supporting new riders through mentorship and on-snow guidance",
  "Making riding more affordable through mountain and community partnerships",
  "Creating connection both on the mountain and beyond it",
];

const VALUES = [
  {
    name: "Inclusion",
    description:
      "Every rider is welcome regardless of experience, background, or budget.",
  },
  {
    name: "Access",
    description:
      "We work to remove the financial and social barriers that keep people off the mountain.",
  },
  {
    name: "Community",
    description:
      "We're building relationships that last beyond a single event or season.",
  },
  {
    name: "Mentorship",
    description:
      "Experienced riders show up for newer ones so no one has to figure it out alone.",
  },
];

export default function MissionPage() {
  return (
    <div className="space-y-12">
      <section id="mission" className="mx-auto max-w-3xl">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Our Mission
        </h1>
        <div className="app-muted mt-4 space-y-4 text-sm leading-relaxed sm:text-base">
          <p>
            Bringing together LGBTQ+ skiers and snowboarders on and off the
            mountain while creating inclusive, accessible spaces for everyone on
            the East Coast.
          </p>
          <p>
            We believe snow sports should be something people can participate in
            regardless of their experience, background, or budget. Chatter works
            to make that possible by:
          </p>
        </div>
        <ul className="app-muted mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed sm:text-base">
          {MISSION_POINTS.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <p className="app-muted mt-4 text-sm leading-relaxed sm:text-base">
          We&apos;re not just creating a place to ride. We&apos;re building a
          community that makes it easier for queer people to get there in the
          first place.
        </p>
      </section>

      <section id="values" className="grid gap-8 sm:grid-cols-3 sm:items-start">
        <div className="sm:col-span-2">
          <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            Our Values
          </h2>
          <ul className="app-muted mt-4 max-w-3xl list-disc space-y-2 pl-5 text-sm leading-relaxed sm:text-base">
            {VALUES.map((value) => (
              <li key={value.name}>
                <span className="text-foreground font-medium">
                  {value.name}.
                </span>{" "}
                {value.description}
              </li>
            ))}
          </ul>
        </div>
        <ImagePlaceholder className="aspect-square rounded-2xl" />
      </section>

      <section id="why-lgbtq" className="mx-auto max-w-3xl">
        <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
          Why LGBTQ+ snow sports
        </h2>
        <div className="app-muted mt-4 space-y-4 text-sm leading-relaxed sm:text-base">
          <p>
            Ski towns and mountain culture haven&apos;t always felt welcoming to
            queer and trans people, and the cost of entry, gear, lift tickets,
            lessons, travel can make snow sports feel out of reach before
            someone even gets to the mountain.
          </p>
          <p>
            A dedicated LGBTQ+ space changes that. It gives people a lower-
            pressure way to try skiing or snowboarding for the first time,
            surrounded by others who understand what it&apos;s like to walk into
            a lodge or a lift line without knowing if they&apos;ll be accepted.
            It also means there&apos;s a community to come back to season after
            season, not just a single event.
          </p>
        </div>
      </section>
    </div>
  );
}
