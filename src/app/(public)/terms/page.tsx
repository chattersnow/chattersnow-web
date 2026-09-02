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
    "The terms you agree to when you use the Chatter Snow website, sign up for an event, apply to volunteer, or take gear from our library.",
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
//   - "Who we are" says Chatter Snow is unincorporated and not a 501(c)(3).
//     Both are true as of the date above: see
//     planning/decisions/2026-08-22-state-of-incorporation.md, which only
//     *recommends* New Jersey and has not been filed. On the day incorporation
//     completes, revisit this whole page rather than deleting one sentence --
//     the entity's legal name, liability position, insurance and charitable
//     status all have to line up, here and in the footer copyright line.
//   - "Donations and payments" says the site takes no money. The privacy
//     policy makes the same promise; change both together, and note that
//     contributions are not tax-deductible until the IRS determination letter
//     is in hand.
//   - Governing law names New Jersey. It is the clause most exposed to the
//     incorporation decision, and it does not by itself decide which state's
//     law governs a dispute arising from NY activity.
//   - The gear library gives donated equipment away permanently. It is not a
//     lending program: supabase's inventory_movements has 'received' and
//     'distributed' and no 'returned', because nothing comes back. Do not
//     reintroduce return, due-date, or damage-liability language here.
//   - This page deliberately does NOT carry a general release of claims.
//     Event waivers, the gear acknowledgement and volunteer agreements each
//     cover their own activity -- see "Other agreements". Keep it that way.

const SECTIONS: readonly LegalSection[] = [
  { id: "who-we-are", title: "Who we are" },
  { id: "using-this-site", title: "Using this site" },
  { id: "events-and-programs", title: "Events and programs" },
  { id: "snow-sports-risks", title: "Snow-sports risks" },
  { id: "gear-library", title: "Gear library" },
  { id: "volunteering", title: "Volunteering" },
  { id: "accessibility-and-inclusion", title: "Accessibility and inclusion" },
  { id: "educational-content", title: "Educational content" },
  { id: "donations-and-payments", title: "Donations and payments" },
  { id: "photos-and-content", title: "Photos, video and what you send us" },
  { id: "other-sites-and-venues", title: "Other websites and venues" },
  { id: "other-agreements", title: "Other agreements" },
  { id: "no-warranties", title: "No warranties" },
  { id: "limitation-of-liability", title: "Limits on liability" },
  { id: "indemnification", title: "Your responsibility to us" },
  { id: "changes", title: "Changes to these terms" },
  { id: "governing-law", title: "Governing law" },
  { id: "severability", title: "Severability" },
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
            asking for gear, and getting in touch. By using the site you&apos;re
            agreeing to them. If you don&apos;t agree, please don&apos;t use the
            site.
          </p>
          <p>
            The short version: we&apos;re volunteers, not a company. Signing up
            here is a request, not a confirmed spot. Skiing and snowboarding
            carry real risk and you take it on yourself. Gear from our library
            is free and yours to keep, and we give it to you exactly as it
            reached us — we don&apos;t check it. We&apos;re not a registered
            charity yet, so contributions aren&apos;t tax-deductible.
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
            charity.
          </p>
          <p>
            That means contributions to Chatter Snow are not tax-deductible
            charitable donations, and nothing on this site should be read as
            claiming otherwise. We&apos;ll update this page when our legal
            status or our tax-exempt status changes — they are two separate
            things and they won&apos;t necessarily happen at the same time.
          </p>
          <p>
            Where these terms refer to our board, organizers, or volunteers,
            that describes how we govern and run ourselves, not a corporation
            that exists today.
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
            Participants under 18 may take part only where a parent or legal
            guardian has completed the required forms and given permission.
            Individual programs may set additional rules, supervision
            requirements, age limits, or screening, and those apply on top of
            these terms. Parental permission on its own doesn&apos;t make a
            program open to a minor.
          </p>
        </div>
      </section>

      <section id="snow-sports-risks">
        <SectionHeading>Snow-sports risks</SectionHeading>
        <div className="app-muted mt-4 space-y-4 text-sm leading-relaxed sm:text-base">
          <p>
            Skiing and snowboarding carry real and inherent risks, including
            serious injury, permanent disability, and death. Those risks come
            from things nobody controls — snow and weather, terrain, ice and
            bare patches, other people on the hill, lifts, and equipment — and
            they cannot be eliminated. If you take part in anything we organize,
            you take those risks on yourself.
          </p>
          <p>
            You&apos;re responsible for riding within your ability, following
            the mountain&apos;s rules and Your Responsibility Code, and wearing
            appropriate safety equipment. Chatter Snow doesn&apos;t provide
            instruction, supervision, guiding, coaching, or medical care, and
            our volunteers aren&apos;t acting as instructors or ski patrol.
            Nobody at a Chatter event is checking whether a run suits you — that
            call is yours.
          </p>
          <p>
            Riding at a mountain is a separate matter between you and that
            venue. Venues and resorts set their own rules, tickets, and waivers,
            and those apply to you directly; we don&apos;t control them and
            aren&apos;t responsible for them.
          </p>
        </div>
      </section>

      <section id="gear-library">
        <SectionHeading>Gear library</SectionHeading>
        <div className="app-muted mt-4 space-y-4 text-sm leading-relaxed sm:text-base">
          <p>
            The gear library is a give-away, not a rental or a loan. People
            donate equipment to us, we catalog it, and we pass it on free of
            charge to someone who needs it. What you pick up is yours to keep —
            there&apos;s no return date, no deposit, and nothing to bring back.
            If it stops being useful to you, we&apos;d love it back for someone
            else, but that&apos;s a kindness, not an obligation.
          </p>
          <p>
            Requesting an item holds it for you while we get in touch.
            We&apos;ll confirm pickup by email.
          </p>
          <p>
            <span className="font-semibold">
              We give gear away exactly as it reaches us.
            </span>{" "}
            We don&apos;t inspect, test, service, repair, certify, or guarantee
            it, and we make no promise that a piece of gear fits you, suits your
            ability, or is safe for what you plan to do with it. We have no way
            of knowing how old it is, how hard it was ridden, or whether it was
            ever damaged before it reached us.
          </p>
          <p>
            <span className="font-semibold">
              We do not perform binding mounting or adjustment, DIN setting,
              boot fitting, or any other safety-critical equipment service.
            </span>{" "}
            Taking gear from us is not us telling you it is safe. Before you use
            anything from the library, it&apos;s on you to decide whether it
            suits you, and to have anything safety-critical — bindings above all
            — inspected and set up by an appropriately qualified technician.
            Helmets that have taken an impact, and gear past its service life,
            should be replaced rather than used.
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

      <section id="accessibility-and-inclusion">
        <SectionHeading>Accessibility and inclusion</SectionHeading>
        <p className="app-muted mt-4 text-sm leading-relaxed sm:text-base">
          We want Chatter Snow&apos;s programs, events, and communications to be
          welcoming and usable. If you need an accommodation to take part in
          something — at an event, on this site, or in how we contact you — tell
          us and we&apos;ll work with you to find a reasonable way to make it
          happen. If something here is inaccessible, we&apos;d rather hear about
          it than not.
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

      <section id="photos-and-content">
        <SectionHeading>Photos, video and what you send us</SectionHeading>
        <div className="app-muted mt-4 space-y-4 text-sm leading-relaxed sm:text-base">
          <p>
            The text, images, logo, and design on this site belong to Chatter
            Snow or the people who made them, and are used here with permission.
            Please don&apos;t reuse them commercially or in a way that suggests
            we endorse you. You&apos;re welcome to link to us, and to share our
            event and program pages as they are.
          </p>
          <p>
            We take photos and video at events. Where we photograph or record
            participants for Chatter Snow&apos;s own communications, we rely on
            the consent process described at registration or at the event
            itself, not on this page — and for anyone under 18, on a parent or
            guardian&apos;s consent.
          </p>
          <p>
            If a photo of you appears on this site or on a Chatter Snow social
            media account and you&apos;d rather it didn&apos;t, email{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="hover:text-foreground underline underline-offset-4"
            >
              {CONTACT_EMAIL}
            </a>{" "}
            and we&apos;ll take it down. We can only remove things we control —
            once an image has been shared onward by someone else, that&apos;s
            out of our hands.
          </p>
          <p>
            You keep ownership of anything you send us — a message, an
            application, a request. You&apos;re giving us permission to use,
            store, and share it as far as we reasonably need to in order to
            answer you, run the program you contacted us about, and keep our
            records.
          </p>
        </div>
      </section>

      <section id="other-sites-and-venues">
        <SectionHeading>Other websites and venues</SectionHeading>
        <p className="app-muted mt-4 text-sm leading-relaxed sm:text-base">
          We link to mountains, partners, and other organizations. We don&apos;t
          control those sites or venues and aren&apos;t responsible for their
          content, their terms, their safety practices, or how they handle your
          information.
        </p>
      </section>

      <section id="other-agreements">
        <SectionHeading>Other agreements</SectionHeading>
        <p className="app-muted mt-4 text-sm leading-relaxed sm:text-base">
          These terms cover this website. Separate agreements cover separate
          activities — event waivers and participation agreements, gear
          acknowledgements, volunteer agreements, our{" "}
          <Link
            href="/code-of-conduct"
            className="hover:text-foreground underline underline-offset-4"
          >
            code of conduct
          </Link>
          , and any rules a venue sets. Where one of those applies to something
          you&apos;re doing, it governs that activity, and nothing on this page
          replaces it or waives it on your behalf.
        </p>
      </section>

      <section id="no-warranties">
        <SectionHeading>No warranties</SectionHeading>
        <p className="app-muted mt-4 text-sm leading-relaxed sm:text-base">
          We run this site as a volunteer organization and provide it as-is. We
          can&apos;t promise it will always be available, up to date, accurate,
          or free of errors, and we don&apos;t make any warranty about it beyond
          what the law requires of us.
        </p>
      </section>

      <section id="limitation-of-liability">
        <SectionHeading>Limits on liability</SectionHeading>
        <div className="app-muted mt-4 space-y-4 text-sm leading-relaxed sm:text-base">
          <p>
            To the fullest extent the law allows, Chatter Snow and its board
            members, volunteers, and organizers aren&apos;t liable for indirect
            or consequential losses arising from your use of this site.
          </p>
          <p>
            Nothing here limits any liability that can&apos;t be limited by law,
            and nothing here is a waiver of your rights in connection with an
            in-person event or with gear you took from the library — those are
            addressed by the agreements described under{" "}
            <a
              href="#other-agreements"
              className="hover:text-foreground underline underline-offset-4"
            >
              other agreements
            </a>
            , where they apply.
          </p>
        </div>
      </section>

      <section id="indemnification">
        <SectionHeading>Your responsibility to us</SectionHeading>
        <p className="app-muted mt-4 text-sm leading-relaxed sm:text-base">
          To the fullest extent the law allows, you agree to be responsible for
          claims, losses, damages, and reasonable expenses that arise from your
          breach of these terms, your misuse of this site, or your intentional
          or negligent conduct in connection with Chatter Snow activities —
          except to the extent they were caused by Chatter Snow&apos;s own
          negligence, or by anything we can&apos;t lawfully disclaim
          responsibility for.
        </p>
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
          These terms are governed by the laws of the State of New Jersey,
          without regard to its conflict-of-laws rules.
        </p>
      </section>

      <section id="severability">
        <SectionHeading>Severability</SectionHeading>
        <p className="app-muted mt-4 text-sm leading-relaxed sm:text-base">
          If any part of these terms turns out to be unenforceable, the rest
          stays in effect to the fullest extent the law allows.
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
