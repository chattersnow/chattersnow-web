import Link from "next/link";
import { HowToSection } from "@/components/how-to-section";
import type { HelpEntry } from "./help-context";

/*
 * Authoring guidelines (grounded in NN/g research on contextual help):
 *
 * - Task-first, not concept-first. Lead with what you do on this page as
 *   short numbered steps, written to be followed while the sheet is open
 *   beside the page. Concepts come after, in their own section.
 * - Skip the obvious. Don't document standard UI ("click Save"). Reserve
 *   entries for what's genuinely non-standard: approval chains,
 *   permission-dependent visibility, status lifecycles, import formats.
 *   If a page needs no explanation, let it fall back to its module or the
 *   root entry rather than padding — low-value help teaches users to stop
 *   opening the sheet.
 * - Progressive disclosure. One-line description, 2–4 short sections, and
 *   a link out for anything long.
 * - Explain the why on rules. Reasons make rules memorable; bare rules
 *   don't stick.
 *
 * Keys are route prefixes resolved by longest match (see help-matcher.ts):
 * a page entry shadows its module entry, which shadows "/portal". Content
 * whose text depends on data fetched by the page (e.g. a live approval
 * threshold) is registered from the page via <PageHelpContent> instead.
 */
export const helpContent: Record<string, HelpEntry> = {
  "/portal": {
    title: "Portal basics",
    description: "How navigation, access, and this help panel work.",
    body: (
      <>
        <HowToSection heading="Finding your way">
          <p>
            The sidebar lists only the modules your roles can access, and quick
            actions at the top cover the most common tasks. The bell in the
            header collects items needing someone&apos;s attention — approvals,
            inbox items, and reminders relevant to you.
          </p>
        </HowToSection>
        <HowToSection heading="Why you might not see a page">
          <p>
            Access is driven by the role permissions matrix, checked on every
            request — if a page you expect is missing, an admin can grant your
            role access under Administration, and it appears immediately without
            a re-login.
          </p>
        </HowToSection>
        <HowToSection heading="About this panel">
          <p>
            This icon shows guidance for whichever page you&apos;re on. Pages
            without their own guide yet fall back to this overview.
          </p>
        </HowToSection>
      </>
    ),
  },
  "/portal/calendar": {
    title: "How calendar items work",
    description: "Priority tiers, sensitive topics, and content opportunities.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">Priority tier</strong> — Tier
              1 items need an explicit Plan, Skip, or Defer decision before
              their date passes (once it&apos;s Tier 1, undecided, and not
              archived, the item is flagged as needing one). Tiers 2 and 3
              don&apos;t require a decision.
            </li>
            <li>
              <strong className="text-foreground">Sensitive topic</strong> —
              flagging an item this way surfaces tone guidance and requires
              someone with manage access to record a review before it&apos;s
              considered handled; unreviewed sensitive items are flagged the
              same way as undecided Tier 1 items.
            </li>
            <li>
              <strong className="text-foreground">Content opportunity</strong> —
              items with a linked content opportunity move through their own
              draft/review/publish stages, tracked on the{" "}
              <Link
                href="/portal/calendar/work-queue"
                className="underline hover:text-foreground"
              >
                Work queue
              </Link>{" "}
              page.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            Anyone with manage access to the content calendar can create or edit
            items and record decisions and sensitive-topic reviews; everyone
            else can view.
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              An undecided Tier 1 item or an unreviewed sensitive item stays
              flagged on this list until it&apos;s handled.
            </li>
            <li>
              Every create, edit, or delete on a calendar item is written to the
              audit log.
            </li>
            <li>
              Items that also have a content opportunity feed the Work
              queue&apos;s due dates — see that page&apos;s own guide for how
              those stages work.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Marking an item sensitive without also recording a review leaves
              it flagged even after everything else about it is finished.
            </li>
            <li>
              Deciding Skip or Defer on a Tier 1 item after its date has already
              passed doesn&apos;t retroactively clear it from history — decide
              before the date when possible.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/calendar/work-queue": {
    title: "How the work queue works",
    description: "Draft, review, and publish stages with their due dates.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">Draft</strong> — an
              opportunity starts here (statuses <code>not_planned</code>,{" "}
              <code>idea</code>, or <code>draft</code>), due two-thirds of the
              way through its lead time, before the publish date.
            </li>
            <li>
              <strong className="text-foreground">Review</strong> — once
              it&apos;s <code>in_review</code> or sent back as{" "}
              <code>changes_requested</code>, the due date shifts to the last
              third of the lead time.
            </li>
            <li>
              <strong className="text-foreground">Publish</strong> — once{" "}
              <code>approved</code> or <code>scheduled</code>, the due date is
              the publish date itself.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            Owners and reviewers work their own items from{" "}
            <strong className="text-foreground">My work</strong>; anyone with
            manage access to the content calendar can act on anything in the{" "}
            <strong className="text-foreground">Upcoming queue</strong>.
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              An item is Overdue when its current stage&apos;s due date has
              passed; nothing is ever overdue once it reaches{" "}
              <code>published</code> or <code>skipped</code>.
            </li>
            <li>
              Status changes here are written to the audit log alongside the
              rest of the calendar item&apos;s history.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Leaving the owner or reviewer fields blank means the item never
              shows up in anyone&apos;s My work tab, only in the general queue.
            </li>
            <li>
              Sending an item back to <code>changes_requested</code>{" "}
              doesn&apos;t reset it to the draft stage&apos;s due-date math — it
              moves to the review stage&apos;s, which can shorten the time left.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/calendar/import": {
    title: "How calendar import works",
    description: "Generating recurring observances and bulk CSV import.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">
                Generate missing instances
              </strong>{" "}
              — for each recurring Tier 1/2 observance missing a date in the
              target year, generate just that one series, or use Generate all to
              fill in every missing one at once.
            </li>
            <li>
              <strong className="text-foreground">Bulk import</strong> — the CSV
              importer adds new one-off dates from an external list.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>Anyone with manage access to the content calendar.</p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Either path only creates internal <code>idea</code>-status drafts
              — nothing is published automatically. Everything still goes
              through the normal sign-off on the main{" "}
              <Link
                href="/portal/calendar"
                className="underline hover:text-foreground"
              >
                Calendar
              </Link>{" "}
              page.
            </li>
            <li>
              New rows count toward that same page&apos;s audit log, just like
              any other calendar item.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Assuming a generated or imported item is already public — it
              isn&apos;t, until someone reviews it and sets its status and
              visibility on the Calendar page.
            </li>
            <li>
              Re-importing the same CSV can create duplicate one-off items —
              check the target year&apos;s coverage first. Re-running Generate
              all for an already-covered year is harmless, since it only fills
              gaps.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/calendar/reports": {
    title: "How the annual review is counted",
    description: "What counts toward each metric, and who can see it.",
    body: (
      <>
        <HowToSection heading="What counts">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              <strong className="text-foreground">
                Tier 1 items with a decision
              </strong>{" "}
              — the share of the selected year&apos;s Tier 1 items (by start
              date) that have a Plan, Skip, or Defer decision recorded.
            </li>
            <li>
              <strong className="text-foreground">
                Planned opportunities completed on time
              </strong>{" "}
              — of opportunities whose calendar item was decided Plan and has a
              publish target date, the share published on or before that date.
            </li>
            <li>
              <strong className="text-foreground">Overdue content tasks</strong>{" "}
              — this year&apos;s opportunities currently past their stage&apos;s
              due date, using the same overdue logic as the Work queue page.
            </li>
            <li>
              <strong className="text-foreground">
                Median time to first review
              </strong>{" "}
              — median days from a brief being created to it entering review,
              counted only for opportunities that have a template and are
              currently <code>in_review</code>.
            </li>
            <li>
              <strong className="text-foreground">
                Public items with a clear Chatter connection
              </strong>{" "}
              — this year&apos;s items that are public, live (active or
              complete), and have a non-empty Chatter connection recorded on
              their opportunity.
            </li>
            <li>
              <strong className="text-foreground">
                Publication permissions recorded
              </strong>{" "}
              — a raw count of publication-permission rows tied to this
              year&apos;s items.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            <strong className="text-foreground">admin</strong> and{" "}
            <strong className="text-foreground">event_coordinator</strong> hold
            manage on this report, while{" "}
            <strong className="text-foreground">finance</strong>,{" "}
            <strong className="text-foreground">board</strong>, and{" "}
            <strong className="text-foreground">volunteer</strong> hold view —
            since the page has no write actions, every calendar role can see it.
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <p>
            Changing the Year selector re-runs the whole computation live from
            that year&apos;s calendar items, opportunities, and permissions —
            nothing is cached.
          </p>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Reading &quot;Median time to first review&quot; as a whole-year
              average — it only reflects opportunities currently sitting in
              review, so it drops to &quot;—&quot; once everything for the year
              has moved past review, even though plenty were reviewed during the
              year.
            </li>
            <li>
              Assuming a metric carries over past years — every figure on this
              page is scoped to the selected year&apos;s items only.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/calendar/program-suggestions": {
    title: "How program suggestions work",
    description:
      "Rules that surface dismissible program chips in the item editor.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">
                Item type and category
              </strong>{" "}
              — each is optional, but at least one is required. Leaving one
              blank makes it a wildcard for that dimension (matches any value),
              while setting both narrows the rule to just that combination —
              e.g. community observance + LGBTQ+ community.
            </li>
            <li>
              <strong className="text-foreground">Active toggle</strong> —
              deactivate a rule to stop it from suggesting without deleting it.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            Anyone with view access to the content calendar can see this list;
            manage access — the same <code>content_calendar</code> permission as
            calendar items themselves, not a separate resource — is needed to
            create, edit, deactivate, or delete rules.
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Matched rules produce dismissible &quot;Suggested&quot; chips next
              to Related programs, in both the new-item dialog and an existing
              item&apos;s edit view — clicking one adds the program, but nothing
              is added automatically.
            </li>
            <li>
              A program already added to the item is never suggested again, even
              if a rule still matches it.
            </li>
            <li>
              Editing or deactivating a rule only changes what&apos;s suggested
              going forward — it doesn&apos;t touch programs already added to
              any calendar item.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              An item-type-only (or category-only) rule matches every value of
              the dimension left blank — e.g. an item-type-only rule suggests
              its program for that type regardless of category, which can be
              broader than intended.
            </li>
            <li>
              Expecting a rule change to retroactively update an item&apos;s
              Related programs — it won&apos;t; only a fresh look at the editor
              re-evaluates suggestions.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/inventory/distribution": {
    title: "How distribution works",
    description: "Recording items leaving inventory.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">Item leaves inventory</strong>{" "}
              — record which item, how many, and when.
            </li>
            <li>
              <strong className="text-foreground">
                Event and recipient are optional
              </strong>{" "}
              — tie a distribution to an event and/or a recipient when it&apos;s
              relevant, or leave them blank for a general distribution.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            Anyone with manage access to inventory or inventory intake — this
            includes <strong className="text-foreground">admin</strong> and{" "}
            <strong className="text-foreground">volunteer</strong> (volunteers
            can edit distribution/gear-checkout records even though they
            don&apos;t get full Inventory reports access).
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              There&apos;s no approval step — recording a distribution here
              immediately reduces the item&apos;s on-hand quantity.
            </li>
            <li>
              It&apos;s written to the audit log against the item&apos;s
              movement history, alongside its receive and adjustment
              transactions.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Recording a new distribution to fix an earlier mistake, when a
              correction/adjustment would keep the on-hand total accurate
              instead of two movements fighting each other.
            </li>
            <li>
              Leaving the recipient blank for a personal handout makes the item
              impossible to trace back to who took it later.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/governance/meetings": {
    title: "How meeting records work",
    description: "Meeting lifecycle and the records tied to each meeting.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">Scheduled</strong> — a meeting
              is created with a date, type, facilitator, and notetaker. Every
              meeting starts here.
            </li>
            <li>
              <strong className="text-foreground">During and after</strong> —
              opening a meeting&apos;s row shows six tabs covering the whole
              record: Overview, Attendees, Agenda, Action Items, Decisions, and
              Resolutions — all keyed to that same meeting.
            </li>
            <li>
              <strong className="text-foreground">
                Completed or cancelled
              </strong>{" "}
              — the meeting&apos;s status is updated once it&apos;s actually
              happened or been called off.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            <strong className="text-foreground">admin</strong> and{" "}
            <strong className="text-foreground">board</strong> manage meetings
            and their sub-records; no other role has access to Governance.
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Attendees, agenda items, decisions (with votes), action items
              (with owners), and resolutions are all logged from their own tab,
              independent of the meeting&apos;s overall status.
            </li>
            <li>
              Governance records aren&apos;t written to the audit log yet,
              unlike expenses, users, and calendar items.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Leaving a meeting&apos;s status as Scheduled after it happens
              makes it look upcoming in board views.
            </li>
            <li>
              Recording a vote as a Decision instead of a Resolution (or vice
              versa) — decisions are lightweight per-meeting entries, while
              resolutions carry motion text, a mover/seconder, and an effective
              date for the formal record.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/finance/reports": {
    title: "How these figures are counted",
    description: "What counts toward income, expenses paid, and net.",
    body: (
      <>
        <HowToSection heading="What counts">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              <strong className="text-foreground">Income</strong> is event
              revenue by the date it was received. Sponsorship commitments are
              tracked separately and are not counted here.
            </li>
            <li>
              <strong className="text-foreground">Expenses paid</strong> counts
              only{" "}
              <Link
                href="/portal/finance/expenses"
                className="underline hover:text-foreground"
              >
                expenses
              </Link>{" "}
              and{" "}
              <Link
                href="/portal/finance/reimbursements"
                className="underline hover:text-foreground"
              >
                reimbursements
              </Link>{" "}
              marked paid, so the net reflects money that has actually left the
              account. Submitted and approved-but-unpaid spend is listed below
              it, and rejected spend never counts toward any total.
            </li>
            <li>
              <strong className="text-foreground">In-kind donations</strong> is
              the face value of items donated in the period. It is not cash, so
              it stays out of the net. Monetary donations are not tracked yet.
            </li>
            <li>
              Expenses count by the date the cost was incurred; reimbursements
              have no such date, so they count by the date the request was
              recorded.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            <strong className="text-foreground">admin</strong> and{" "}
            <strong className="text-foreground">finance</strong> see the live
            figures; <strong className="text-foreground">board</strong> gets a
            view-only version for oversight; other roles have no access to
            Finance reports.
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <p>
            Changing the date range re-runs the same report live — nothing is
            cached, so figures always reflect the current state of expenses,
            reimbursements, revenue, and donations.
          </p>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Reading Net as cash-on-hand — it only reflects paid spend, so an
              approved-but-unpaid expense doesn&apos;t reduce Net yet, even
              though it&apos;s committed.
            </li>
            <li>
              Picking a From date after the To date returns nothing; the page
              will tell you to fix the range.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/volunteers/participation": {
    title: "How hours logging works",
    description: "Logging volunteer hours and where they roll up.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">
                Hours are logged directly
              </strong>{" "}
              — there&apos;s no approval step.
            </li>
            <li>
              <strong className="text-foreground">
                Event and role type are optional
              </strong>{" "}
              — tie an entry to an event and a role type when it&apos;s
              relevant, or leave them blank for general hours.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            A volunteer with logging access can log their own hours; anyone with
            manage access (<strong className="text-foreground">admin</strong>)
            can log hours for another volunteer too.{" "}
            <strong className="text-foreground">event_coordinator</strong> can
            view all entries but can&apos;t log on someone else&apos;s behalf.
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Logged hours roll up into the total shown below and link back to
              the volunteer&apos;s record in People.
            </li>
            <li>
              They feed the Impact Tracking rollups (e.g. &quot;290 volunteer
              hours&quot; in a season report) once the entry is tied to a
              program&apos;s event.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Logging hours against the wrong event is easy to miss since
              there&apos;s no approval step to catch it later.
            </li>
            <li>
              Trying to log hours for another volunteer without manage access —
              the entry is rejected, since logging access only covers your own
              hours.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/programs/reports": {
    title: "How the program impact rollup is counted",
    description: "What feeds each figure, and the event-linkage it needs.",
    body: (
      <>
        <HowToSection heading="What counts">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              <strong className="text-foreground">
                Participants, first-time, beginner, and assistance figures
              </strong>{" "}
              — summed from each event&apos;s impact note. An event with no
              impact note recorded contributes zero to all of them.
            </li>
            <li>
              <strong className="text-foreground">Equipment distributed</strong>{" "}
              — summed from inventory movements of type <code>distributed</code>{" "}
              tied to the program&apos;s events; this is separate from{" "}
              <strong className="text-foreground">Equipment loans</strong>,
              which is self-reported on the impact note instead.
            </li>
            <li>
              <strong className="text-foreground">Volunteer hours</strong> —
              summed only from hours entries tied to one of the program&apos;s
              events; hours logged with no event, or against an event not
              assigned to this program, don&apos;t count.
            </li>
            <li>
              <strong className="text-foreground">Repeat participants</strong> —
              people registered for two or more of the program&apos;s events.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            <strong className="text-foreground">admin</strong> and{" "}
            <strong className="text-foreground">event_coordinator</strong> hold
            manage, <strong className="text-foreground">finance</strong> and{" "}
            <strong className="text-foreground">board</strong> hold view, and{" "}
            <strong className="text-foreground">volunteer</strong> has no access
            — a narrower split than most other reports, since this rollup
            surfaces per-event financial-assistance figures.
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <p>
            There&apos;s no date range — each season is its own{" "}
            <Link
              href="/portal/programs"
              className="underline hover:text-foreground"
            >
              program
            </Link>{" "}
            row, so selecting a program rolls up every event ever assigned to
            it, computed live with nothing cached.
          </p>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Logging volunteer hours without tying the entry to an event, or to
              an event that isn&apos;t assigned to this program — either way
              those hours won&apos;t reach this rollup.
            </li>
            <li>
              Expecting an event to count just because it&apos;s scheduled — the
              participant and assistance figures only show up once someone
              records that event&apos;s impact note.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/administration/access-management": {
    title: "How access management works",
    description: "Sensitivity, review cadence, and the access grant lifecycle.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">Sensitivity</strong> — Low,
              Medium, High, or Critical drives how often the asset should be
              reviewed (annually for Low/Medium, every 6 months for High, every
              3 for Critical) and the expected MFA and two-admin coverage for
              it.
            </li>
            <li>
              <strong className="text-foreground">Record review</strong> — sets
              Last reviewed to today and computes Next review from that cadence.
            </li>
            <li>
              <strong className="text-foreground">Access grants</strong> — add a
              grant per person with an access level and optional expiry; Verify
              logs a check without changing anything else; Revoke ends it for
              good.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            Unlike the rest of Administration, this page isn&apos;t admin-only:
            manage access on{" "}
            <strong className="text-foreground">
              Access management assets
            </strong>{" "}
            covers everything above, while manage access on{" "}
            <strong className="text-foreground">
              Access management reviews
            </strong>{" "}
            only covers Record review and Verify — not creating, editing, or
            deleting assets or grants.
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Sensitivity&apos;s review cadence and MFA/two-admin expectations
              are advisory only — nothing blocks saving an asset that falls
              short of its own tier&apos;s expectations.
            </li>
            <li>
              A grant past its Expires date isn&apos;t automatically marked
              expired or revoked — it stays active until someone verifies or
              revokes it.
            </li>
            <li>
              Revoking a grant keeps the row for the audit trail rather than
              deleting it; re-adding the same person afterward creates a new
              grant instead of reactivating the old one.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              This is not a credential store — never enter a password, API key,
              token, or recovery code; Account identifier is only an email or
              username.
            </li>
            <li>
              The asset page&apos;s Audit history card only shows changes to the
              asset record itself (name, sensitivity, review dates, and so on) —
              grant activity lives in the full{" "}
              <Link
                href="/portal/administration/audit-log?table=access_grants"
                className="underline hover:text-foreground"
              >
                audit log
              </Link>
              , filtered to Access grants.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/administration/roles": {
    title: "How roles work",
    description: "Creating roles that the permissions matrix grants access to.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              Give the role a name and optional description — that&apos;s all
              this page does.
            </li>
            <li>
              Grant it access on the{" "}
              <Link
                href="/portal/administration/permissions"
                className="underline hover:text-foreground"
              >
                Permissions
              </Link>{" "}
              page — a new role starts with no access to anything until
              it&apos;s granted there.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            Only <strong className="text-foreground">admin</strong> — this page
            is admin-only like the rest of Administration.
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              The built-in roles (admin, event_coordinator, finance, board,
              volunteer) can&apos;t be renamed or deleted from here.
            </li>
            <li>
              A role still assigned to any user can&apos;t be deleted either —
              the error names how many users are affected.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Creating a role and assigning someone to it without ever visiting
              Permissions leaves that person with no page access at all.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/administration/audit-log": {
    title: "How the audit log works",
    description: "What's tracked automatically, and what isn't yet.",
    body: (
      <>
        <HowToSection heading="Steps">
          <p>
            Filter by table, action, actor, and date range, then open a row to
            see the change itself — a before/after diff for an update, or the
            full record for an insert or delete.
          </p>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            Only <strong className="text-foreground">admin</strong> — this page
            is view-only and admin-only like the rest of Administration.
          </p>
        </HowToSection>
        <HowToSection heading="What's tracked">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Most write-heavy portal records are logged automatically:
              donations, inventory, event expenses, user roles, app settings,
              calendar items, content opportunities, and access
              management&apos;s services, assets, and grants, among others.
            </li>
            <li>
              Governance records (meetings, decisions, resolutions) and event
              edits aren&apos;t written here yet — see those pages&apos; own
              guidance.
            </li>
            <li>
              The Table filter above doesn&apos;t yet list every audited table —
              reimbursements, event revenue, deactivated users, and monetary
              donations are logged but only show up while it&apos;s left on
              &quot;All tables&quot;.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Assuming a table missing from the filter dropdown isn&apos;t
              tracked — check &quot;All tables&quot; first before concluding
              that.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/administration/permissions": {
    title: "How the permissions matrix works",
    description: "Granting roles None, View, or Manage per resource.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              Pick a role&apos;s row and a resource&apos;s column, then click
              the cell to cycle it through{" "}
              <strong className="text-foreground">None</strong>,{" "}
              <strong className="text-foreground">View</strong>, and{" "}
              <strong className="text-foreground">Manage</strong>. Manage
              includes everything View does, plus the ability to create, edit,
              or delete.
            </li>
            <li>
              There&apos;s no separate save step — each click writes
              immediately.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            Only <strong className="text-foreground">admin</strong> —
            Administration (users, permissions, settings, audit log) is
            admin-only across the whole portal.
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Route guards and the sidebar nav both read this same matrix on
              every request, so a role loses or gains a page immediately — no
              re-login, no deploy.
            </li>
            <li>
              A new role you create starts with no permissions on any resource
              until you grant them here.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Removing the last admin&apos;s Manage on Administration locks
              everyone, including you, out of this page — keep at least one
              admin with full access.
            </li>
            <li>
              A role with View but not Manage on a resource can still open that
              page, but every create/edit/delete action on it stays disabled or
              hidden.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/administration/system-settings": {
    title: "How these thresholds are used",
    description: "Where the approval thresholds take effect.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">Below the threshold</strong> —
              finance can approve their own expense or reimbursement submission
              on the{" "}
              <Link
                href="/portal/finance/expenses"
                className="underline hover:text-foreground"
              >
                Expenses
              </Link>{" "}
              and{" "}
              <Link
                href="/portal/finance/reimbursements"
                className="underline hover:text-foreground"
              >
                Reimbursements
              </Link>{" "}
              pages.
            </li>
            <li>
              <strong className="text-foreground">
                At or above the threshold
              </strong>{" "}
              — an admin or board member, other than whoever submitted it, has
              to approve or reject it instead.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            Only <strong className="text-foreground">admin</strong> can change
            these settings.
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              These two numbers don&apos;t do anything on this page directly —
              they&apos;re read by the expense and reimbursement approval flow
              each time an approver opens a submission, so changing one here
              changes behavior on those two pages immediately, without a code
              change.
            </li>
            <li>
              Every change to a threshold is written to the audit log
              (Administration &gt; Audit log), so you can see who moved it and
              when.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Setting a threshold to 0 forces every submission through
              second-approval, even trivial ones.
            </li>
            <li>
              Leaving a threshold blank doesn&apos;t disable approval — it just
              means the page falls back to always requiring a second approver.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/administration/users": {
    title: "How user access works",
    description: "Active users, pending grants, and invite links.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">Active users</strong> — an
              admin assigns or removes roles directly on an existing account, or
              deactivates it. Deactivating revokes portal access immediately but
              keeps their roles on file for reactivation.
            </li>
            <li>
              <strong className="text-foreground">Pending access</strong> — new
              access instead starts by staging an email and role below. That
              creates a grant with status <code>pending</code>.
            </li>
            <li>
              <strong className="text-foreground">Invite</strong> — clicking
              Invite generates a one-time link, valid for about an hour. Nothing
              is emailed automatically — you have to copy the link and share it
              yourself.
            </li>
            <li>
              <strong className="text-foreground">Claimed or revoked</strong> —
              the grant becomes <code>claimed</code> once the person signs up
              with that link, or an admin can <code>revoke</code> it beforehand.
              An unused link that passes its hour shows as Expired but stays
              revocable/re-inviteable.
            </li>
          </ol>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            Only <strong className="text-foreground">admin</strong> can grant,
            edit, or revoke access.
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Deactivating a user revokes portal access on their very next
              request — there&apos;s no session to clear or grace period.
            </li>
            <li>
              Role assignments, deactivations, and pending-grant changes are all
              written to the audit log.
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Forgetting to copy and send the invite link — nothing is emailed
              for you, so the pending grant just sits there until someone shares
              it.
            </li>
            <li>
              Revoking your own admin role removes your own access immediately —
              have another admin do it if you&apos;re stepping back.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
  "/portal/events": {
    title: "How status and visibility work",
    description: "The event lifecycle and public-site visibility.",
    body: (
      <>
        <HowToSection heading="Steps">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">Status</strong> tracks where
              an event is in its lifecycle: draft → published → completed, or
              cancelled/archived along the way.
            </li>
            <li>
              <strong className="text-foreground">Visibility</strong> controls
              whether an event can appear on the public site.
            </li>
            <li>Both are set independently from the event editor.</li>
          </ol>
        </HowToSection>
        <HowToSection heading="Who can do this">
          <p>
            <strong className="text-foreground">admin</strong> and{" "}
            <strong className="text-foreground">event_coordinator</strong>{" "}
            manage events; <strong className="text-foreground">finance</strong>{" "}
            has view-only access for expense and sponsor reconciliation;
            volunteers can view and sign up; board has no access to this page.
          </p>
        </HowToSection>
        <HowToSection heading="What happens downstream">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              These two fields are independent — a public event still won&apos;t
              show on the public site while it&apos;s draft, and a published
              event marked private stays portal-only.
            </li>
            <li>
              Event edits are not yet written to the audit log (unlike expenses,
              calendar items, and most other portal records).
            </li>
          </ul>
        </HowToSection>
        <HowToSection heading="Common mistakes">
          <ul className="list-disc space-y-2 pl-4">
            <li>
              Publishing an event without also setting Visibility to public —
              the event moves past draft but still won&apos;t show publicly.
            </li>
            <li>
              Forgetting to mark a past event Completed leaves it showing as
              upcoming in reports that key off status.
            </li>
          </ul>
        </HowToSection>
      </>
    ),
  },
};
