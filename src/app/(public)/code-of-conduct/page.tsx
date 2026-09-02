import type { Metadata } from "next";
import Link from "next/link";
import { LifeBuoyIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CONDUCT_EMAIL, CONTACT_EMAIL } from "@/lib/contact-addresses";
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

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
      {children}
    </h2>
  );
}

// Only "What isn't tolerated" is long enough to need these. It carries two
// different kinds of rule -- how we treat each other, and what keeps people
// physically safe -- and a single nine-item list made them read as one
// undifferentiated list of bans.
function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="brand-display mt-8 text-lg font-semibold tracking-[-0.02em] first:mt-6 sm:text-xl">
      {children}
    </h3>
  );
}

// NOTE FOR MAINTAINERS: this page is published policy, not marketing copy.
//
//   - CONDUCT_EMAIL must be a real, monitored inbox before this page ships. A
//     code of conduct whose reporting address bounces is worse than none: it
//     tells someone they have a route, and then loses their report.
//   - The response commitments below ("aim to acknowledge within 5 days",
//     "when practicable, at least two board members") are promises to the
//     people who report. Don't soften or restate them here without the board
//     agreeing to the change first. BOARD RATIFICATION PENDING: both were
//     hard promises until 2026-09-02, when they were qualified so the page
//     doesn't guarantee what a three-person volunteer board can't always
//     deliver -- a report over a holiday, or one that leaves too few
//     unconflicted members to make two. The board still has to agree to the
//     qualified wording; see planning/decisions/2026-09-02-public-legal-pages.md.
//   - The page states expectations, not promises Chatter can't keep. Nothing
//     here should offer absolute confidentiality, guarantee an outcome, or
//     imply volunteers supervise anyone -- those are the four places
//     (privacy, timelines, discipline, supervision) where a code of conduct
//     usually over-commits.
//   - Discipline wording is bounded by the bylaws: removal from a
//     volunteer or organizational role happens "where authorized under
//     Chatter Snow's governing documents", so this page never purports to
//     grant the board a power the bylaws don't.
//   - Minors and photography are set by /terms, not here. This page repeats
//     the parts that bear on conduct and points at the terms for the rest;
//     if the terms change, sweep this page in the same commit.
//   - The board is three people, so the conflict-of-interest path in
//     "How we handle a report" matters in practice, not in theory. Revisit it
//     if the board grows or if a dedicated safety role is created --
//     see planning/governance/roles-and-responsibilities.md.
//   - CONDUCT_EMAIL is a distribution list reaching every board member, not a
//     mailbox someone can be excluded from, so "Reporting a problem" says so
//     outright. Do not soften that back into "it goes to the board": a reader
//     reporting a board member will assume that means the person won't see
//     it, and they will. The missing piece is a direct route to one person
//     for exactly that case -- add it here and on /about/team once there is
//     an individual address to publish.

// Drives the section nav beside the document. Every entry has to match an
// id on a <section> below, or the link scrolls nowhere -- legal-page.dom.test.tsx
// checks the two stay in step.
const SECTIONS: readonly LegalSection[] = [
  { id: "what-we-expect", title: "What we expect" },
  { id: "bringing-a-minor", title: "If you’re bringing a minor" },
  { id: "on-the-mountain", title: "On the mountain" },
  { id: "what-isnt-tolerated", title: "What isn’t tolerated" },
  { id: "reporting-a-problem", title: "Reporting a problem" },
  { id: "how-we-handle-a-report", title: "How we handle a report" },
  { id: "if-you-disagree", title: "If you disagree with a decision" },
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
            partners, and sponsors — at every Chatter Snow event, on transport
            and in lodging we arrange, in our online spaces and group chats, on
            our social accounts, and any time you&apos;re representing Chatter
            Snow or acting on its behalf. What you say in your own life is your
            own business; this is about the spaces we run and the times
            you&apos;re standing in for us.
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
              href={`mailto:${CONDUCT_EMAIL}`}
              className="hover:text-foreground underline underline-offset-4"
            >
              {CONDUCT_EMAIL}
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
            Respect people&apos;s privacy. What someone tells you about
            themselves — their identity, their health, their story — stays with
            you unless they&apos;ve said otherwise. The only exceptions are
            narrow: passing something on to deal with a safety concern, or
            because we&apos;re legally required to.
          </li>
        </ul>
        {/* Chatter's own photography is governed by /terms and by the consent
            captured at registration, not by this page. Said here anyway,
            because the bullet above tells people to ask before they film --
            and a reader who then sees an organizer with a camera deserves to
            know which rule that falls under. */}
        <p className="app-muted mt-6 text-sm leading-relaxed sm:text-base">
          Chatter Snow takes photos and video at events for our own newsletters,
          site, and social accounts. When we do, we go on the consent process
          described at registration or at the event — see our{" "}
          <Link
            href="/terms"
            className="hover:text-foreground underline underline-offset-4"
          >
            terms of use
          </Link>
          . You can tell any organizer you&apos;d rather not be photographed,
          and that holds for the rest of the event.
        </p>
      </section>

      <section id="bringing-a-minor">
        <SectionHeading>If you&apos;re bringing a minor</SectionHeading>
        <div className="app-muted mt-4 space-y-4 text-sm leading-relaxed sm:text-base">
          <p>
            Chatter Snow events are built around adult community, and we&apos;re
            not set up or staffed to supervise anyone. Someone under 18 can come
            where a parent or legal guardian has given permission and completed
            the forms our{" "}
            <Link
              href="/terms"
              className="hover:text-foreground underline underline-offset-4"
            >
              terms of use
            </Link>{" "}
            require — and that adult needs to be at the event, with them, for
            the whole of it.
          </p>
          <p>
            Our volunteers are not chaperones and can&apos;t take that on. If
            the responsible adult leaves, the minor leaves too. Individual
            programs may set a higher age limit or their own supervision rules,
            and those apply on top of this.
          </p>
        </div>
      </section>

      <section id="on-the-mountain">
        <SectionHeading>On the mountain</SectionHeading>
        <div className="app-muted mt-4 space-y-4 text-sm leading-relaxed sm:text-base">
          <p>
            Our volunteers are riders, not instructors, guides, or patrollers.
            Nobody here is supervising you, and you&apos;re responsible for your
            own decisions on the hill. In an emergency, get ski patrol first and
            tell a Chatter organizer second.
          </p>
          <p>
            Ride within your ability and follow the mountain&apos;s rules and
            Your Responsibility Code. People ahead of you have the right of way.
            Don&apos;t stop where you can&apos;t be seen from above. Don&apos;t
            talk anyone into terrain they&apos;ve said they aren&apos;t ready
            for, and make a real effort to stay with the people in your group —
            beginners especially — rather than dropping them on a run they
            didn&apos;t choose.
          </p>
          <p>
            Don&apos;t ride impaired — by alcohol, cannabis, other drugs,
            medication, or exhaustion. If you&apos;re drinking, do it after
            you&apos;re done for the day, and don&apos;t pressure anyone else to
            drink — plenty of people here don&apos;t.
          </p>
        </div>
      </section>

      <section id="what-isnt-tolerated">
        <SectionHeading>What isn&apos;t tolerated</SectionHeading>
        <SubHeading>How we treat each other</SubHeading>
        <ul className="app-muted mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed sm:text-base">
          <li>
            Harassment or discrimination based on gender identity or expression,
            sexual orientation, race, ethnicity, national origin, religion,
            disability, body size, age, HIV status, or socioeconomic status.
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
            Retaliating against someone for making a report or supporting
            someone who did.
          </li>
        </ul>
        <SubHeading>Staying safe</SubHeading>
        <ul className="app-muted mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed sm:text-base">
          <li>Violence, threats of violence, or encouraging either.</li>
          <li>
            Carrying a weapon where the law, the venue, or Chatter Snow
            doesn&apos;t allow it. If you&apos;re not sure, the answer at a
            Chatter event is no.
          </li>
          <li>
            Riding impaired, or riding in a way that puts other people at risk.
          </li>
          <li>Ignoring ski patrol, mountain staff, or venue staff.</li>
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
              href={`mailto:${CONDUCT_EMAIL}`}
              className="hover:text-foreground underline underline-offset-4"
            >
              {CONDUCT_EMAIL}
            </a>
            . It goes to the board. Tell us what happened, roughly when, and
            what you&apos;d like to see happen — and say if you&apos;d rather a
            particular person not be involved in handling it.
          </p>
          <p>
            Being straight with you about what that address is: it&apos;s a list
            that reaches all three board members, not a separate mailbox. So if
            your report is about a board member, they will see it. It will be{" "}
            <em>handled</em> by the board members who aren&apos;t involved, and
            if that isn&apos;t possible we&apos;ll tell you and find someone
            outside the board — but we&apos;d rather you knew who reads it
            before you write than found out afterward.
          </p>
          {/* Anonymous reporting is offered without a dedicated intake form
              behind it -- someone can simply leave their name out of the
              email. The trade-off is stated plainly rather than buried,
              because an anonymous report we can't follow up on is a real
              limit on what we can do, and finding that out afterward would
              feel like a bait and switch. */}
          <p>
            You can report anonymously if you&apos;d rather — leave your name
            out of the email, or ask an organizer to pass something on without
            attaching you to it. It&apos;s a real option and people should use
            it if they need it. It does cost something: we can&apos;t come back
            to you with questions or tell you what came of it, and that
            sometimes limits what we&apos;re able to do.
          </p>
          <p>
            Reporting in good faith is protected, whatever we end up concluding.
            If we can&apos;t establish what happened, that is not the same as
            deciding you lied, and nobody will be treated as though it were.
            Knowingly making a false report, or lying to us during a review, is
            a different thing — it hurts the person it&apos;s aimed at and the
            trust this whole process depends on, and we&apos;ll handle it under
            this code like anything else here.
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
            We aim to acknowledge your report within 5 days. When practicable,
            at least two board members review it, and anyone with a personal
            stake in it steps out of the process. Where that isn&apos;t possible
            — three people run Chatter, and a report can leave too few of us
            unconflicted — we&apos;ll tell you, and find someone outside the
            board.
          </p>
          <p>
            We share what you told us only with the people who need it to
            respond, and we&apos;ll tell you before we share it more widely than
            that. We won&apos;t contact anyone else about it without checking
            with you first, unless someone is in danger or we&apos;re legally
            required to. What we can&apos;t promise is secrecy: looking into
            something usually means talking to the person it&apos;s about, and
            sometimes to witnesses.
          </p>
          <p>
            Depending on what we find, the response can be a conversation, a
            warning, being asked to leave an event, being removed from a
            volunteer or organizational role where our governing documents allow
            it, or being barred from Chatter Snow events for a period or for
            good. We&apos;ll tell you what we did about your report, as far as
            we&apos;re able. We won&apos;t share the private details of someone
            else&apos;s situation, and asking us to won&apos;t change that.
          </p>
          <p>
            We can act on urgent safety concerns immediately, before a full
            review, and we can decline to keep anyone at an event. We&apos;d
            rather lose an attendee than lose the room.
          </p>
        </div>
      </section>

      <section id="if-you-disagree">
        <SectionHeading>If you disagree with a decision</SectionHeading>
        <div className="app-muted mt-4 space-y-4 text-sm leading-relaxed sm:text-base">
          <p>
            If you were the subject of a report and you think we got it wrong,
            you can ask for a second look. Email{" "}
            <a
              href={`mailto:${CONDUCT_EMAIL}`}
              className="hover:text-foreground underline underline-offset-4"
            >
              {CONDUCT_EMAIL}
            </a>{" "}
            within 14 days of our decision and tell us what you think we missed.
            It gets reviewed by board members who weren&apos;t part of the
            original decision, or — if there aren&apos;t any — by someone
            outside the board.
          </p>
          <p>
            We won&apos;t reverse a decision just because someone is unhappy
            with it, and anything we did for immediate safety stays in place
            while an appeal is looked at. But everyone gets one honest second
            look.
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
            href={`mailto:${CONDUCT_EMAIL}`}
            className="hover:text-foreground underline underline-offset-4"
          >
            {CONDUCT_EMAIL}
          </a>{" "}
          for reports, so they don&apos;t sit in a general inbox.
        </p>
      </section>
    </LegalPageShell>
  );
}
