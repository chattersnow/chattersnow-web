import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Us | Chatter Snow",
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

export default function AboutPage() {
  return (
    <div className="space-y-12">
      <section>
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          About Chatter
        </h1>
        <div className="app-muted mt-4 max-w-3xl space-y-4 text-sm leading-relaxed sm:text-base">
          <p>
            Chatter is a queer ski and snowboard community on the East Coast
            that brings LGBTQ+ riders together both on and off the mountain.
            What started as a small group of friends has grown into a community
            hosting indoor and mountain meetups, collaborating with other
            organizations, and creating opportunities for queer skiers and
            snowboarders to get involved regardless of experience or budget.
          </p>
          <p>
            At its core, Chatter is about making snow sports more accessible and
            building community around them. That means more than just organizing
            group rides. Chatter provides gear through donations and drives,
            facilitates gear swaps, connects newer riders with on-snow
            mentorship, and works with mountains and partners to make events
            more affordable.
          </p>
        </div>
      </section>

      <section>
        <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
          Our Story
        </h2>
        <div className="app-muted mt-4 max-w-3xl space-y-4 text-sm leading-relaxed sm:text-base">
          <p>
            Chatter started three summers ago when a group of friends wanted to
            create a space where queer skiers and snowboarders could find each
            other, ride together, and feel like they belonged on the mountain.
          </p>
          <p>
            Since then, that idea has grown into an East Coast community.
            We&apos;ve brought people together through indoor snow sessions,
            mountain meetups, park days, collaborations, and events with partner
            organizations. Our community is largely centered around the NYC
            area, but we&apos;re continuing to grow our reach across the East
            Coast.
          </p>
          <p>
            As we&apos;ve grown, we&apos;ve realized that simply creating
            opportunities to ride together isn&apos;t enough. Snow sports can be
            expensive and intimidating to get into, especially for someone who
            doesn&apos;t already have the equipment, knowledge, or community
            around them.
          </p>
          <p>That&apos;s where Chatter&apos;s bigger purpose comes in.</p>
          <p>
            We&apos;re working to make skiing and snowboarding more accessible
            to LGBTQ+ people by helping remove some of the financial and social
            barriers that keep people off the mountain. Through gear donations
            and swaps, beginner mentorship, affordable group events, and
            partnerships with mountains and other organizations, we&apos;re
            building a community where people can get into snow sports, improve
            their skills, and find people to ride with.
          </p>
        </div>
      </section>

      <section id="mission">
        <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
          Our Mission
        </h2>
        <div className="app-muted mt-4 max-w-3xl space-y-4 text-sm leading-relaxed sm:text-base">
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
        <ul className="app-muted mt-4 max-w-3xl list-disc space-y-2 pl-5 text-sm leading-relaxed sm:text-base">
          {MISSION_POINTS.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
          We&apos;re not just creating a place to ride. We&apos;re building a
          community that makes it easier for queer people to get there in the
          first place.
        </p>
      </section>

      <section id="values">
        <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
          Our Values
        </h2>
        <ul className="app-muted mt-4 max-w-3xl list-disc space-y-2 pl-5 text-sm leading-relaxed sm:text-base">
          {VALUES.map((value) => (
            <li key={value.name}>
              <span className="text-foreground font-medium">{value.name}.</span>{" "}
              {value.description}
            </li>
          ))}
        </ul>
      </section>

      <section id="why-lgbtq">
        <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
          Why LGBTQ+ snow sports
        </h2>
        <div className="app-muted mt-4 max-w-3xl space-y-4 text-sm leading-relaxed sm:text-base">
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
