import type { Metadata } from "next";
import Link from "next/link";
import { LifeBuoyIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  LegalPageShell,
  type LegalSection,
} from "@/components/legal-page-shell";

export const metadata: Metadata = {
  title: "Code of Conduct | Chatter Snow",
  description:
    "What we expect from everyone at Chatter Snow events and in our spaces, what isn't tolerated, and how to report a problem.",
};

// Shown to visitors and kept in sync by hand: bump it in the same commit as
// any change to the text below, since a stale date is worse than none.
const LAST_UPDATED = "September 2, 2026";

const REPORT_EMAIL = "conduct@chattersnow.org";
const CONTACT_EMAIL = "info@chattersnow.org";

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
      {children}
    </h2>
  );
}

// NOTE FOR MAINTAINERS: this page is published policy, not marketing copy.
//
//   - REPORT_EMAIL must be a real, monitored inbox before this page ships. A
//     code of conduct whose reporting address bounces is worse than none: it
//     tells someone they have a route, and then loses their report.
//   - The response commitments below ("within 5 days", "two board members")
//     are promises to the people who report. Don't soften or restate them
//     here without the board agreeing to the change first.
//   - The board is three people, so the conflict-of-interest path in
//     "How we handle a report" matters in practice, not in theory. Revisit it
//     if the board grows or if a dedicated safety role is created --
//     see planning/governance/roles-and-responsibilities.md.
// Drives the section nav beside the document. Every entry has to match an
// id on a <section> below, or the link scrolls nowhere -- legal-page.dom.test.tsx
// checks the two stay in step.
const SECTIONS: readonly LegalSection[] = [
  { id: "what-we-expect", title: "What we expect" },
  { id: "on-the-mountain", title: "On the mountain" },
  { id: "what-isnt-tolerated", title: "What isn’t tolerated" },
  { id: "reporting-a-problem", title: "Reporting a problem" },
  { id: "how-we-handle-a-report", title: "How we handle a report" },
  { id: "questions", title: "Questions" },
] as const;

export default function CodeOfConductPage() {
  return (
    <LegalPageShell
      title="Code of Conduct"
      lastUpdated={LAST_UPDATED}
      sections={SECTIONS}
      summary={
        <>
          <p>
            Chatter Snow exists so that LGBTQ+ people have somewhere to ride
            where they don&apos;t have to brace for anything. That only works if
            everyone here helps make it true. This page is what we expect from
            each other, what we won&apos;t accept, and what to do when something
            goes wrong.
          </p>
          <p>
            It applies to everyone — riders, guests, volunteers, board members,
            partners, and sponsors — at every Chatter Snow event, on our
            transport and in our lodging, in our online spaces and group chats,
            and in any conversation about Chatter with people outside it.
          </p>
        </>
      }
    >
      {/* Lifted out of "Reporting a problem", five sections down. For someone
          who just had a bad experience that section is the only one that
          matters, and they are scanning rather than reading -- the route to
          tell us has to be above the fold, not findable. The full section
          stays where it is. */}
      <Alert>
        <LifeBuoyIcon />
        <AlertTitle>Something happened? Tell us.</AlertTitle>
        <AlertDescription>
          <p>
            At an event, find any Chatter organizer or volunteer. Any time,
            email{" "}
            <a
              href={`mailto:${REPORT_EMAIL}`}
              className="hover:text-foreground underline underline-offset-4"
            >
              {REPORT_EMAIL}
            </a>
            . You don&apos;t need to be certain, be the person it happened to,
            or have proof. See{" "}
            <a
              href="#reporting-a-problem"
              className="hover:text-foreground underline underline-offset-4"
            >
              reporting a problem
            </a>{" "}
            for what happens next.
          </p>
        </AlertDescription>
      </Alert>

      <section id="what-we-expect">
        <SectionHeading>What we expect</SectionHeading>
        <ul className="app-muted mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed sm:text-base">
          <li>
            Treat people the way they ask to be treated. Use the name and
            pronouns someone gives you. If you get it wrong, correct yourself
            and move on — a short apology is better than a long one.
          </li>
          <li>
            Assume a range of experience. Beginners are the point, not an
            inconvenience. Nobody owes you an explanation of why they&apos;re on
            a green run.
          </li>
          <li>
            Ask before you touch someone, their gear, or their board. Ask before
            you photograph or film them, and stop if they say no.
          </li>
          <li>
            Take &quot;no&quot; the first time — about a run, a drink, a photo,
            a ride home, a conversation, a number.
          </li>
          <li>
            Look after the people around you. If someone seems isolated, cold,
            in over their head, or uncomfortable, check in.
          </li>
          <li>
            Keep what people share about themselves — their identity, their
            health, their story — to yourself unless they&apos;ve said
            otherwise.
          </li>
        </ul>
      </section>

      <section id="on-the-mountain">
        <SectionHeading>On the mountain</SectionHeading>
        <div className="app-muted mt-4 space-y-4 text-sm leading-relaxed sm:text-base">
          <p>
            Ride within your ability and follow the mountain&apos;s rules and
            Your Responsibility Code. People ahead of you have the right of way.
            Don&apos;t stop where you can&apos;t be seen from above. Don&apos;t
            talk anyone into terrain they&apos;ve said they aren&apos;t ready
            for, and don&apos;t leave a rider from your group alone on a run
            they didn&apos;t choose.
          </p>
          <p>
            Don&apos;t ride impaired. If you&apos;re drinking, do it after
            you&apos;re done for the day, and don&apos;t pressure anyone else to
            drink — plenty of people here don&apos;t.
          </p>
          <p>
            Our volunteers are riders, not instructors or patrollers. In an
            emergency, get ski patrol first and tell a Chatter organizer second.
          </p>
        </div>
      </section>

      <section id="what-isnt-tolerated">
        <SectionHeading>What isn&apos;t tolerated</SectionHeading>
        <ul className="app-muted mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed sm:text-base">
          <li>
            Harassment or discrimination based on gender identity or expression,
            sexual orientation, race, ethnicity, national origin, religion,
            disability, body size, age, HIV status, or class.
          </li>
          <li>
            Deliberate misgendering, deadnaming, or pressing someone about their
            body, transition, surgeries, or how they identify.
          </li>
          <li>
            Outing anyone — to this group, to their family, to their employer,
            or online. This includes tagging people in photos from an event
            without asking.
          </li>
          <li>
            Unwanted sexual attention, sexual comments, or touching. Flirting
            that continues after a &quot;no&quot; is harassment.
          </li>
          <li>
            Photographing or filming someone who has asked you not to, or
            posting a photo of someone who has asked you to take it down.
          </li>
          <li>
            Intimidation, stalking, following someone, or repeated unwanted
            contact after an event.
          </li>
          <li>
            Violence or threats of violence, and encouraging either. Weapons at
            Chatter events.
          </li>
          <li>
            Riding in a way that puts other people at risk, or ignoring ski
            patrol or venue staff.
          </li>
          <li>
            Retaliating against someone for making a report or supporting
            someone who did.
          </li>
        </ul>
        <p className="app-muted mt-6 text-sm leading-relaxed sm:text-base">
          &quot;It was a joke&quot; is not a defense. The effect on the person
          matters more than the intent behind it.
        </p>
      </section>

      <section id="reporting-a-problem">
        <SectionHeading>Reporting a problem</SectionHeading>
        <div className="app-muted mt-4 space-y-4 text-sm leading-relaxed sm:text-base">
          <p>
            If something happens, tell us. You don&apos;t need to be certain, be
            the person it happened to, or have proof.
          </p>
          <p>
            <span className="font-semibold">At an event:</span> find any Chatter
            organizer or volunteer. They can move you away from a situation,
            stay with you, or handle it on the spot.
          </p>
          <p>
            <span className="font-semibold">Any time:</span> email{" "}
            <a
              href={`mailto:${REPORT_EMAIL}`}
              className="hover:text-foreground underline underline-offset-4"
            >
              {REPORT_EMAIL}
            </a>
            . It goes to the board. Tell us what happened, roughly when, and
            what you&apos;d like to see happen — and say if you&apos;d rather a
            particular person not be involved in handling it.
          </p>
          <p>
            If your report is about a board member, say so and it will be
            handled by board members who aren&apos;t involved. If that
            isn&apos;t possible, we&apos;ll tell you and find someone outside
            the board.
          </p>
          <p>
            In an emergency, or if someone is in immediate danger, call 911 or
            ski patrol first. We&apos;ll deal with the rest afterward.
          </p>
        </div>
      </section>

      <section id="how-we-handle-a-report">
        <SectionHeading>How we handle a report</SectionHeading>
        <div className="app-muted mt-4 space-y-4 text-sm leading-relaxed sm:text-base">
          <p>
            We&apos;ll acknowledge your report within 5 days. At least two board
            members review it, and anyone with a personal stake in it steps out
            of the process.
          </p>
          <p>
            We share what you told us only with the people who need it to
            respond, and we&apos;ll tell you before we share it more widely than
            that. We won&apos;t contact anyone else about it without checking
            with you first, unless someone is in danger or we&apos;re legally
            required to.
          </p>
          <p>
            Depending on what we find, the response can be a conversation, a
            warning, being asked to leave an event, being removed from a role,
            or being barred from Chatter Snow events for a period or for good.
            We&apos;ll tell you what we decided. We won&apos;t always be able to
            share the details of what happened to someone else.
          </p>
          <p>
            We can act on urgent safety concerns immediately, before a full
            review, and we can decline to keep anyone at an event. We&apos;d
            rather lose an attendee than lose the room.
          </p>
        </div>
      </section>

      <section id="questions">
        <SectionHeading>Questions</SectionHeading>
        <p className="app-muted mt-4 text-sm leading-relaxed sm:text-base">
          Questions about this code — including suggestions for improving it —
          go to{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="hover:text-foreground underline underline-offset-4"
          >
            {CONTACT_EMAIL}
          </a>{" "}
          or the{" "}
          <Link
            href="/contact"
            className="hover:text-foreground underline underline-offset-4"
          >
            contact form
          </Link>
          . Please use{" "}
          <a
            href={`mailto:${REPORT_EMAIL}`}
            className="hover:text-foreground underline underline-offset-4"
          >
            {REPORT_EMAIL}
          </a>{" "}
          for reports, so they don&apos;t sit in a general inbox.
        </p>
      </section>
    </LegalPageShell>
  );
}
