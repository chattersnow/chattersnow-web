import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Us | Chatter Snow",
};

export default function AboutPage() {
  return (
    <div>
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
    </div>
  );
}
