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
