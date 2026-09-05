import type { Metadata } from "next";
import Link from "next/link";
import { PRIVACY_EMAIL } from "@/lib/contact-addresses";
import { RETENTION } from "@/lib/retention";
import {
  LegalPageShell,
  type LegalSection,
} from "@/components/legal-page-shell";

export const metadata: Metadata = {
  title: "Privacy Policy | Chatter Snow",
  description:
    "What personal information Chatter Snow collects through this site, why we collect it, how long we keep it, and how to ask for a copy or a deletion.",
};

// Shown to visitors and kept in sync by hand: bump it in the same commit as
// any change to the policy text below, since a stale date is worse than none.
const LAST_UPDATED = "September 5, 2026";

// One entry per place on this site that asks a visitor for personal
// information. The fields listed here are the ones the form actually submits
// (see the parsers under src/app/(public)/*), so a new field on a public form
// means a new line here.
const COLLECTION = [
  {
    source: "Contact form",
    href: "/contact",
    collected:
      "Your name, email address, the topic you pick, and your message.",
    purpose: "So we can read what you sent and reply to you.",
  },
  {
    source: "Volunteer application",
    href: "/get-involved/volunteer",
    collected:
      "Your name, email address, and — if you choose to give them — your phone number, the roles you're interested in, and your availability.",
    purpose:
      "To review your application, follow up about volunteering, and let you check your application status with the reference code we give you.",
  },
  {
    source: "Event registration",
    href: "/events",
    collected:
      "Your name, email address, party size, and — optionally — your phone number, Instagram handle, and any notes you add. If you fill in a rider profile, we also store whether you ski or snowboard, your experience level, and your preferred mountain.",
    purpose:
      "To hold your spot, plan the event around who's coming, send you event details, and match the day to the experience levels showing up.",
  },
  {
    source: "Gear requests",
    href: "/gears/library",
    collected:
      "Your name, email address, and — optionally — your phone number and any notes about what you need.",
    purpose:
      "To match you with the gear you asked for and arrange a time to hand it over.",
  },
  {
    source: "Portal accounts",
    href: null,
    collected:
      "For board members and volunteer leads only: the email address you sign in with, and a session cookie that keeps you signed in. Signing in with Google shares your Google account's email address and name with us.",
    purpose:
      "To sign you in to the operations portal and apply the permissions attached to your role.",
  },
] as const;

// RETENTION now lives in src/lib/retention.ts, imported above: the purge job
// added in #602 enforces the same periods from the retention_policies table, and
// an integration test asserts the published prose and the enforced clock cannot
// drift apart. Change a period in the planning decision record first.

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
      {children}
    </h2>
  );
}

// Drives the section nav beside the document. Every entry has to match an
// id on a <section> below, or the link scrolls nowhere -- legal-page.dom.test.tsx
// checks the two stay in step.
const SECTIONS: readonly LegalSection[] = [
  { id: "what-we-collect", title: "What we collect, and why" },
  { id: "what-we-dont-do", title: "What we don’t do" },
  { id: "how-long-we-keep-it", title: "How long we keep it" },
  { id: "who-can-see-it", title: "Who can see it" },
  { id: "how-we-protect-it", title: "How we protect it" },
  { id: "cookies-and-analytics", title: "Cookies and analytics" },
  { id: "other-sites", title: "Other sites we link to" },
  { id: "your-choices", title: "Your choices" },
  { id: "minors", title: "Minors" },
  { id: "changes", title: "Changes to this policy" },
  { id: "contact", title: "Contact" },
] as const;

export default function PrivacyPage() {
  return (
    <LegalPageShell
      title="Privacy Policy"
      lastUpdated={LAST_UPDATED}
      sections={SECTIONS}
      summary={
        <>
          <p>
            Chatter Snow is an LGBTQ+ ski and snowboard community organization
            on the East Coast. This policy explains what personal information we
            collect through this website, why we collect it, who can see it, how
            long we keep it, and how to ask us for a copy or a deletion.
          </p>
          <p>
            The short version: we try to collect only the information we need to
            run our events, programs, and gear library and to keep in touch with
            you, we don&apos;t sell or rent it to anyone, and you can ask us to
            delete it — apart from the few records we&apos;re legally required
            to keep — by emailing{" "}
            <a
              href={`mailto:${PRIVACY_EMAIL}`}
              className="hover:text-foreground underline underline-offset-4"
            >
              {PRIVACY_EMAIL}
            </a>
            .
          </p>
        </>
      }
    >
      <section id="what-we-collect">
        <SectionHeading>What we collect, and why</SectionHeading>
        <p className="app-muted mt-4 text-sm leading-relaxed sm:text-base">
          Everything below is information you type into a form yourself. We
          don&apos;t buy personal information about you from anyone else.
        </p>
        <dl className="mt-6 space-y-6">
          {COLLECTION.map((item) => (
            <div key={item.source}>
              <dt className="font-semibold">
                {item.href ? (
                  <Link
                    href={item.href}
                    className="hover:text-foreground underline underline-offset-4"
                  >
                    {item.source}
                  </Link>
                ) : (
                  item.source
                )}
              </dt>
              <dd className="app-muted mt-2 space-y-2 text-sm leading-relaxed sm:text-base">
                <p>{item.collected}</p>
                <p>{item.purpose}</p>
              </dd>
            </div>
          ))}
        </dl>
        <p className="app-muted mt-6 text-sm leading-relaxed sm:text-base">
          We also record the IP address a form submission came from and store it
          with that submission. It is used only to stop spam and abuse — to
          limit how many times the same sender can submit a form in a short
          window — and it is deleted when the submission it belongs to is
          deleted.
        </p>
        <p className="app-muted mt-4 text-sm leading-relaxed sm:text-base">
          We are an LGBTQ+ organization, and you never have to tell us anything
          about your sexual orientation or gender identity to take part. None of
          our forms ask for it, and nothing about your participation is
          published by us. The rider details we do ask for — whether you ski or
          snowboard, your experience level, your preferred mountain — are there
          to plan the day around the group that&apos;s coming, nothing else.
        </p>
      </section>

      <section id="what-we-dont-do">
        <SectionHeading>What we don&apos;t do</SectionHeading>
        <ul className="app-muted mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed sm:text-base">
          <li>
            We don&apos;t sell, rent, or trade your personal information, and we
            don&apos;t share it with advertisers.
          </li>
          <li>
            We don&apos;t use advertising or cross-site tracking cookies on this
            site.
          </li>
          <li>
            We don&apos;t take payments or store card details on this site.
            Online monetary donations aren&apos;t open yet; when they are, this
            policy will be updated before they go live.
          </li>
          <li>
            We don&apos;t publish your information. Names and photos only appear
            on the public site when someone has agreed to that separately, such
            as a board member on our{" "}
            <Link
              href="/about/team"
              className="hover:text-foreground underline underline-offset-4"
            >
              team page
            </Link>
            .
          </li>
        </ul>
      </section>

      <section id="how-long-we-keep-it">
        <SectionHeading>How long we keep it</SectionHeading>
        <p className="app-muted mt-4 text-sm leading-relaxed sm:text-base">
          We keep personal information only for as long as we reasonably need it
          for the purposes described here. When we no longer need it, we delete
          it, or we strip the personal details and keep only the count — how
          many people came to an event, how many first-time riders — which tells
          us nothing about you.
        </p>
        <dl className="mt-6 space-y-3">
          {RETENTION.map((item) => (
            <div key={item.what} className="sm:flex sm:gap-4">
              <dt className="font-semibold sm:w-2/5 sm:shrink-0">
                {item.what}
              </dt>
              <dd className="app-muted text-sm leading-relaxed sm:text-base">
                {item.howLong}
              </dd>
            </div>
          ))}
        </dl>
        <p className="app-muted mt-6 text-sm leading-relaxed sm:text-base">
          These periods are enforced by a scheduled job, not by hand: it runs
          nightly and removes or anonymizes whatever has passed its date, and
          keeps a record of what it did so we can check the policy is being
          applied.
        </p>
        <p className="app-muted mt-6 text-sm leading-relaxed sm:text-base">
          Some records have to outlive those periods because the law or our own
          accounting requires it — donation and financial records we need for
          our reporting and tax filings, for example. A few organizational
          records, such as tax filings, financial statements, and governance
          records, we keep permanently. If you ask us to delete your information
          and something falls into one of those categories, we&apos;ll tell you
          what we have to keep and why.
        </p>
      </section>

      <section id="who-can-see-it">
        <SectionHeading>Who can see it</SectionHeading>
        <div className="app-muted mt-4 space-y-4 text-sm leading-relaxed sm:text-base">
          <p>
            Inside Chatter, what you submit is visible to the board members and
            volunteer leads whose role covers it — the people running events see
            event registrations, the volunteer coordinator sees volunteer
            applications, and so on. Access is enforced in the database by the
            permissions attached to each role, not just hidden in the interface.
          </p>
          <p>
            Running an event means the volunteers staffing it may need to see
            who registered — a check-in list, a head count, who asked for gear
            or noted something we should know about on the day. We don&apos;t
            publish participant lists, and we don&apos;t give your name or
            contact details to a mountain, a partner, or a sponsor unless you
            have agreed to that separately, or the venue requires it to let the
            group in and we&apos;ve told you so when you registered.
          </p>
          <p>
            Outside Chatter, we rely on a small number of service providers to
            run the site. They handle information on our behalf, under their own
            terms and privacy policies:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <span className="font-semibold">Supabase</span> — hosts our
              database and handles portal sign-in.
            </li>
            <li>
              <span className="font-semibold">Vercel</span> — hosts this website
              and provides the aggregate traffic counts we use to see which
              pages get visited.
            </li>
            <li>
              <span className="font-semibold">Google</span> — only if you choose
              to sign in to the portal with a Google account.
            </li>
          </ul>
          <p>
            We&apos;ll also share information if we&apos;re legally required to,
            or if it&apos;s necessary to protect someone&apos;s safety.
          </p>
        </div>
      </section>

      <section id="how-we-protect-it">
        <SectionHeading>How we protect it</SectionHeading>
        <div className="app-muted mt-4 space-y-4 text-sm leading-relaxed sm:text-base">
          <p>
            We use reasonable administrative, technical, and organizational
            safeguards to protect what you give us: information travels to the
            site over an encrypted connection, portal accounts are individual
            rather than shared, and access to each kind of record is limited to
            the roles that need it and enforced by the database itself.
          </p>
          <p>
            No website or database is perfectly secure, and we can&apos;t
            promise otherwise. If a breach ever affects your information,
            we&apos;ll tell you and the authorities we&apos;re required to tell,
            as promptly as we can.
          </p>
        </div>
      </section>

      <section id="cookies-and-analytics">
        <SectionHeading>Cookies and analytics</SectionHeading>
        <div className="app-muted mt-4 space-y-4 text-sm leading-relaxed sm:text-base">
          <p>
            The public site sets no cookies of its own. The one cookie we do set
            is the session cookie that keeps board members and volunteer leads
            signed in to the operations portal, and it&apos;s only set once
            someone signs in.
          </p>
          <p>
            We use Vercel Web Analytics to count page views. It reports visits
            in aggregate, sets no cookies and stores nothing on your device, and
            doesn&apos;t follow you across other websites. We don&apos;t run
            Google Analytics or any advertising analytics on this site.
          </p>
        </div>
      </section>

      <section id="other-sites">
        <SectionHeading>Other sites we link to</SectionHeading>
        <p className="app-muted mt-4 text-sm leading-relaxed sm:text-base">
          We link out to mountains, partner organizations, sponsors, and our
          social accounts. Once you follow one of those links you&apos;re on
          someone else&apos;s site, and what they collect is covered by their
          privacy policy, not this one — worth a read before you hand them
          anything. The same goes for the ticketing or payment services we may
          use in the future; if we add one, we&apos;ll name it here first.
        </p>
      </section>

      <section id="your-choices">
        <SectionHeading>Your choices</SectionHeading>
        <div className="app-muted mt-4 space-y-4 text-sm leading-relaxed sm:text-base">
          <p>
            Email{" "}
            <a
              href={`mailto:${PRIVACY_EMAIL}`}
              className="hover:text-foreground underline underline-offset-4"
            >
              {PRIVACY_EMAIL}
            </a>{" "}
            and you can ask us to:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>send you a copy of what we hold about you,</li>
            <li>correct anything that&apos;s wrong,</li>
            <li>
              delete your information, subject to the records we&apos;re
              required to keep, and
            </li>
            <li>stop emailing you about events, programs, or volunteering.</li>
          </ul>
          <p>
            We aim to respond within 30 days. So that we don&apos;t hand your
            information to someone else, please write from the email address you
            gave us, or be ready to confirm the details of the submission
            you&apos;re asking about.
          </p>
        </div>
      </section>

      <section id="minors">
        <SectionHeading>Minors</SectionHeading>
        <p className="app-muted mt-4 text-sm leading-relaxed sm:text-base">
          This site isn&apos;t directed at children under 13, and we don&apos;t
          knowingly collect their personal information through it. Where a
          program is open to riders under 18, we ask a parent or guardian to
          complete the forms. If you believe a child has given us information
          through this site, email us and we&apos;ll delete it.
        </p>
      </section>

      <section id="changes">
        <SectionHeading>Changes to this policy</SectionHeading>
        <p className="app-muted mt-4 text-sm leading-relaxed sm:text-base">
          If we start collecting something new or using it differently,
          we&apos;ll update this page and change the date at the top. For a
          change that materially affects information you&apos;ve already given
          us, we&apos;ll say so directly rather than relying on you to re-read
          the page.
        </p>
      </section>

      <section id="contact">
        <SectionHeading>Contact</SectionHeading>
        <p className="app-muted mt-4 text-sm leading-relaxed sm:text-base">
          Questions about this policy, or about anything we hold on you, go to{" "}
          <a
            href={`mailto:${PRIVACY_EMAIL}`}
            className="hover:text-foreground underline underline-offset-4"
          >
            {PRIVACY_EMAIL}
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
