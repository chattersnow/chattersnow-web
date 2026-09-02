import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/contact-addresses";
import {
  LegalPageShell,
  type LegalSection,
} from "@/components/legal-page-shell";

export const metadata: Metadata = {
  title: "Terms of Use | Chatter Snow",
  description:
    "The terms you agree to when you use the Chatter Snow website, sign up for an event, apply to volunteer, or borrow gear.",
};

// Shown to visitors and kept in sync by hand: bump it in the same commit as
// any change to the terms below, since a stale date is worse than none.
const LAST_UPDATED = "September 2, 2026";

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
      {children}
    </h2>
  );
}

// NOTE FOR MAINTAINERS: several statements below track facts that are expected
// to change and must be revisited when they do.
//
//   - "Who we are" says Chatter Snow is an unincorporated community
//     organization and not a 501(c)(3). Both are true as of the date above:
//     see planning/decisions/2026-08-22-state-of-incorporation.md, which only
//     *recommends* New Jersey and has not been filed. Update this section, the
//     governing-law section, and the copyright line in (public)/layout.tsx on
//     the day incorporation completes.
//   - "Donations and payments" says the site takes no money. The privacy
//     policy makes the same promise; change both together, and note that
//     contributions are not tax-deductible until the IRS determination letter
//     is in hand.
//   - Governing law names New Jersey because that is where the recurring
//     programming happens and the proposed home state. It is the one clause
//     here most exposed to the incorporation decision.
// Drives the section nav beside the document. Every entry has to match an
// id on a <section> below, or the link scrolls nowhere -- legal-page.dom.test.tsx
// checks the two stay in step.
const SECTIONS: readonly LegalSection[] = [
  { id: "who-we-are", title: "Who we are" },
  { id: "using-this-site", title: "Using this site" },
  { id: "events-and-programs", title: "Events and programs" },
  { id: "gear-library", title: "Gear library" },
  { id: "volunteering", title: "Volunteering" },
  { id: "educational-content", title: "Educational content" },
  { id: "donations-and-payments", title: "Donations and payments" },
  { id: "content-and-photos", title: "Content and photos" },
  { id: "other-sites-we-link-to", title: "Other sites we link to" },
  { id: "no-warranties", title: "No warranties and liability" },
  { id: "changes", title: "Changes to these terms" },
  { id: "governing-law", title: "Governing law" },
  { id: "contact", title: "Contact" },
] as const;

export default function TermsPage() {
  return (
    <LegalPageShell
      title="Terms of Use"
      lastUpdated={LAST_UPDATED}
      sections={SECTIONS}
      summary={
        <>
          <p>
            These terms cover this website and the things you can do through it
            — reading about us, signing up for an event, applying to volunteer,
            asking to borrow gear, and getting in touch. By using the site
            you&apos;re agreeing to them. If you don&apos;t agree, please
            don&apos;t use the site.
          </p>
          <p>
            The short version: we&apos;re volunteers, not a company. Signing up
            here is a request, not a confirmed spot. Skiing and snowboarding
            carry real risk and you take it on yourself. Gear from our library
            is lent as-is. We&apos;re not a registered charity yet, so
            contributions aren&apos;t tax-deductible.
          </p>
          <p>
            How we handle the information you give us is covered separately, in
            our{" "}
            <Link
              href="/privacy"
              className="hover:text-foreground underline underline-offset-4"
            >
              privacy policy
            </Link>
            .
          </p>
        </>
      }
    >
      <section id="who-we-are">
        <SectionHeading>Who we are</SectionHeading>
        <div className="app-muted mt-4 space-y-4 text-sm leading-relaxed sm:text-base">
          <p>
            Chatter Snow is an LGBTQ+ ski and snowboard community organization
            on the East Coast, run by volunteers. We are currently an
            unincorporated community organization: we have not completed
            incorporation, and we are not a registered 501(c)(3) tax-exempt
            charity. We&apos;ll say so on this page when that changes.
          </p>
          <p>
            That means contributions to Chatter Snow are not tax-deductible
            charitable donations, and nothing on this site should be read as
            claiming otherwise.
          </p>
        </div>
      </section>

      <section id="using-this-site">
        <SectionHeading>Using this site</SectionHeading>
        <p className="app-muted mt-4 text-sm leading-relaxed sm:text-base">
          Use the site for its intended purpose, and please don&apos;t:
        </p>
        <ul className="app-muted mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed sm:text-base">
          <li>
            submit someone else&apos;s personal information, or sign someone up
            for something without their say-so,
          </li>
          <li>
            submit deliberately false information on a form, including a fake
            name or an email address that isn&apos;t yours,
          </li>
          <li>
            send harassing, threatening, hateful, or discriminatory content
            through any form on this site,
          </li>
          <li>
            try to get into parts of the site you haven&apos;t been given access
            to, including the operations portal, or interfere with how the site
            runs for anyone else, or
          </li>
          <li>
            scrape, bulk-download, or automatically submit to the site. We
            rate-limit form submissions to keep spam out.
          </li>
        </ul>
        <p className="app-muted mt-6 text-sm leading-relaxed sm:text-base">
          We may decline or remove a submission, or turn down a request to
          participate, if it breaks these terms.
        </p>
      </section>

      <section id="events-and-programs">
        <SectionHeading>Events and programs</SectionHeading>
        <div className="app-muted mt-4 space-y-4 text-sm leading-relaxed sm:text-base">
          <p>
            Registering through this site is a request for a spot, not a
            confirmed one. Spots are limited, and we&apos;ll confirm by email.
            Event details — dates, times, locations, and whether an event
            happens at all — can change, especially with weather and mountain
            conditions. Lift tickets, rentals, lessons, transportation, and food
            are your own responsibility and your own cost unless we say
            otherwise for a specific event.
          </p>
          <p>
            Skiing and snowboarding carry real and inherent risks, including
            serious injury. You take part at your own risk, and you&apos;re
            responsible for riding within your ability, following the
            mountain&apos;s rules, and wearing appropriate safety equipment.
            Chatter Snow doesn&apos;t provide instruction, supervision, guiding,
            or medical care, and our volunteers aren&apos;t acting as
            instructors or patrollers.
          </p>
          <p>
            Venues and resorts set their own rules, tickets, and waivers, and
            those apply to you directly — we don&apos;t control them. Some
            events also require you to sign a separate participation waiver on
            the day; where one applies, it governs the event alongside these
            terms.
          </p>
          <p>
            Everyone at a Chatter Snow event is also covered by our{" "}
            <Link
              href="/code-of-conduct"
              className="hover:text-foreground underline underline-offset-4"
            >
              code of conduct
            </Link>
            , which sets out what we expect from each other and how to report a
            problem.
          </p>
          <p>
            Where a program is open to riders under 18, a parent or guardian has
            to complete the forms and give permission.
          </p>
        </div>
      </section>

      <section id="gear-library">
        <SectionHeading>Gear library</SectionHeading>
        <div className="app-muted mt-4 space-y-4 text-sm leading-relaxed sm:text-base">
          <p>
            Gear in our library is donated and lent free of charge, as-is. We
            don&apos;t inspect, service, certify, or guarantee it, and we make
            no promise that a piece of gear fits you, suits your ability, or is
            safe for what you plan to do with it. Get bindings and any other
            safety-critical setup checked by a qualified technician before you
            use them.
          </p>
          <p>
            If you borrow gear, you&apos;re responsible for looking after it and
            returning it by the date we agree. Submitting a request doesn&apos;t
            reserve anything — availability is confirmed by a person.
          </p>
        </div>
      </section>

      <section id="volunteering">
        <SectionHeading>Volunteering</SectionHeading>
        <p className="app-muted mt-4 text-sm leading-relaxed sm:text-base">
          Applying to volunteer doesn&apos;t create a job, an employment
          relationship, or a promise of a role, and volunteering with Chatter
          Snow is unpaid. Some roles may require screening before you can take
          them on. Volunteers act on behalf of Chatter Snow only within the role
          they&apos;ve been given.
        </p>
      </section>

      <section id="educational-content">
        <SectionHeading>Educational content</SectionHeading>
        <p className="app-muted mt-4 text-sm leading-relaxed sm:text-base">
          Articles and guides on this site are informational starting points,
          not personalized advice, instruction, or a certification program. For
          anything involving safety, equipment setup, or an injury, check with a
          qualified professional — a certified technician, instructor, or
          medical provider.
        </p>
      </section>

      <section id="donations-and-payments">
        <SectionHeading>Donations and payments</SectionHeading>
        <p className="app-muted mt-4 text-sm leading-relaxed sm:text-base">
          This site doesn&apos;t take payments and doesn&apos;t store card
          details. Online monetary donations aren&apos;t open yet. When they
          open, we&apos;ll update this page and the privacy policy first, and
          we&apos;ll be explicit about our tax status at that time.
        </p>
      </section>

      <section id="content-and-photos">
        <SectionHeading>Content and photos</SectionHeading>
        <div className="app-muted mt-4 space-y-4 text-sm leading-relaxed sm:text-base">
          <p>
            The text, images, logo, and design on this site belong to Chatter
            Snow or the people who made them, and are used here with permission.
            Please don&apos;t reuse them commercially or in a way that suggests
            we endorse you. You&apos;re welcome to link to us, and to share our
            event and program pages as they are.
          </p>
          <p>
            We take photos and video at events. We use them to show what Chatter
            is like, and we only publish a photo where the people in it have
            agreed to that. If a photo of you is on this site and you&apos;d
            rather it weren&apos;t, email{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="hover:text-foreground underline underline-offset-4"
            >
              {CONTACT_EMAIL}
            </a>{" "}
            and we&apos;ll take it down.
          </p>
          <p>
            When you send us a message, an application, or a request, you keep
            what you wrote. You&apos;re giving us permission to use it to run
            the thing you contacted us about.
          </p>
        </div>
      </section>

      <section id="other-sites-we-link-to">
        <SectionHeading>Other sites we link to</SectionHeading>
        <p className="app-muted mt-4 text-sm leading-relaxed sm:text-base">
          We link to mountains, partners, and other organizations. We don&apos;t
          control those sites and aren&apos;t responsible for their content,
          their terms, or how they handle your information.
        </p>
      </section>

      <section id="no-warranties">
        <SectionHeading>No warranties, and limits on liability</SectionHeading>
        <div className="app-muted mt-4 space-y-4 text-sm leading-relaxed sm:text-base">
          <p>
            We run this site as a volunteer organization and provide it as-is.
            We can&apos;t promise it will always be available, up to date, or
            free of errors.
          </p>
          <p>
            To the fullest extent the law allows, Chatter Snow and its board
            members, volunteers, and organizers aren&apos;t liable for indirect
            or consequential losses arising from your use of this site. Nothing
            here limits any liability that can&apos;t be limited by law, and
            nothing here is a waiver of your rights in connection with an
            in-person event — those are addressed by the waiver you sign for
            that event, where one applies.
          </p>
        </div>
      </section>

      <section id="changes">
        <SectionHeading>Changes to these terms</SectionHeading>
        <p className="app-muted mt-4 text-sm leading-relaxed sm:text-base">
          We&apos;ll update this page when things change, and change the date at
          the top. For a change that materially affects something you&apos;ve
          already signed up for, we&apos;ll tell you directly rather than
          relying on you to re-read the page.
        </p>
      </section>

      <section id="governing-law">
        <SectionHeading>Governing law</SectionHeading>
        <p className="app-muted mt-4 text-sm leading-relaxed sm:text-base">
          These terms are governed by the laws of the State of New Jersey, where
          most of our programming takes place, without regard to its
          conflict-of-laws rules.
        </p>
      </section>

      <section id="contact">
        <SectionHeading>Contact</SectionHeading>
        <p className="app-muted mt-4 text-sm leading-relaxed sm:text-base">
          Questions about these terms go to{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="hover:text-foreground underline underline-offset-4"
          >
            {CONTACT_EMAIL}
          </a>
          . You can also reach us through the{" "}
          <Link
            href="/contact"
            className="hover:text-foreground underline underline-offset-4"
          >
            contact form
          </Link>
          .
        </p>
      </section>
    </LegalPageShell>
  );
}
