import { Bell, CircleHelp, PanelsTopLeft, Sparkles } from "lucide-react";
import {
  hasPermission,
  type PermissionLevel,
  type PermissionMap,
} from "@/lib/auth/permissions";
import type { DialogStep } from "./step-dialog";

/**
 * Copy for the first-login tour, kept apart from the dialog mechanics the same
 * way help-content.tsx is kept apart from help-button.tsx. Edit this file to
 * change what the tour says; welcome-dialog.tsx never needs to change with it.
 *
 * Every claim here has to stay true of the shell it describes. In particular
 * the notifications step must keep saying the bell is absent when nothing is
 * pending -- notifications-menu.tsx returns null at items.length === 0, so a
 * new user very often won't see it while the tour is describing it.
 *
 * It also has to stay true of the *tenant*. The tour used to open by naming
 * seven sections, and after #900 a tenant that was never sold Inventory got a
 * welcome dialog advertising a gear library it has no way to reach -- the same
 * failure the sidebar and the dashboard avoid for free by reading
 * my_permissions(). Every section this file names now goes through
 * `reachable()` below, against the same permission map the sidebar reads, so
 * the tour cannot name a section the reader will not find.
 *
 * This is the standing introduction, not an announcement: anything tied to a
 * specific release goes in releases.tsx instead.
 */

/**
 * Something the tour may name, and the access that has to hold before it does.
 *
 * `level` matters as much as the resource: the quick-action examples are gated
 * at `manage` because that is what sidebar-quick-actions.tsx gates the buttons
 * on, and naming "recording a donation" to someone holding `finance: view`
 * would point at a button they do not get.
 */
type NamedSection = {
  label: string;
  resource: string;
  level: PermissionLevel;
};

/**
 * The sections the opening step lists, in the order it reads them out.
 *
 * One label per module rather than per resource -- "donations" and "finances"
 * were two names for Finance in the original copy, and a list that says both
 * reads like two sections. The Content Calendar comes last because it is the
 * one whose name is not also an everyday word.
 */
const TOUR_SECTIONS: NamedSection[] = [
  { label: "events", resource: "events", level: "view" },
  { label: "inventory", resource: "inventory", level: "view" },
  { label: "finances", resource: "finance", level: "view" },
  { label: "governance", resource: "governance", level: "view" },
  { label: "volunteers", resource: "volunteers", level: "view" },
  { label: "programs", resource: "programs", level: "view" },
  {
    label: "the content calendar",
    resource: "content_calendar",
    level: "view",
  },
];

/**
 * Examples of the quick actions the sidebar offers, for the navigation step.
 *
 * Each one names a button buildQuickActions() actually renders and carries the
 * gate that function gives it, so an example the tour offers is an action the
 * reader can take. At most two are named: the sentence is an illustration, not
 * an inventory, and the original copy named exactly two.
 */
const QUICK_ACTION_EXAMPLES: NamedSection[] = [
  { label: "creating an event", resource: "events", level: "manage" },
  { label: "logging a donation", resource: "finance", level: "manage" },
  {
    label: "recording a gear donation",
    resource: "inventory_intake",
    level: "manage",
  },
  {
    label: "logging volunteer hours",
    resource: "volunteers",
    level: "manage",
  },
];

/**
 * The clauses the notifications step lists, each carrying the gate the portal
 * layout puts on the matching attention summary before the bell can show it.
 */
const ATTENTION_EXAMPLES: NamedSection[] = [
  {
    label: "approvals you can grant",
    resource: "finance_approvals",
    level: "manage",
  },
  { label: "attendees still to check in", resource: "events", level: "view" },
  {
    label: "new volunteer applications",
    resource: "volunteers",
    level: "view",
  },
  { label: "contact messages", resource: "communications", level: "view" },
  {
    label: "content that's yours or overdue",
    resource: "content_calendar",
    level: "view",
  },
];

/** The labels this reader can actually reach, capped at `limit` if given. */
function reachable(
  sections: NamedSection[],
  permissions: PermissionMap,
  limit?: number,
): string[] {
  const labels = sections
    .filter((section) =>
      hasPermission(permissions, section.resource, section.level),
    )
    .map((section) => section.label);
  return limit === undefined ? labels : labels.slice(0, limit);
}

/**
 * "a, b and c" -- the Oxford-comma-free house style the portal's own empty
 * states use. Returns "" for an empty list, which every caller checks for:
 * a reader whose access is narrow enough to leave one of these lists empty
 * gets a sentence that does not mention sections at all, rather than a
 * sentence with a hole in it.
 */
function sentenceList(labels: string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

export function welcomeSteps(permissions: PermissionMap): DialogStep[] {
  const sections = sentenceList(reachable(TOUR_SECTIONS, permissions));
  const quickActions = sentenceList(
    reachable(QUICK_ACTION_EXAMPLES, permissions, 2),
  );
  const attention = sentenceList(reachable(ATTENTION_EXAMPLES, permissions));

  return [
    {
      key: "welcome",
      icon: Sparkles,
      title: "Welcome to the Operations Portal",
      body: (
        <>
          <p>
            This is where your organization&apos;s work gets tracked
            {sections ? <> — {sections}</> : null}.
          </p>
          <p>
            You&apos;ll only see the sections your role gives you access to, so
            the portal looks different from one person to the next. Your
            starting point is the Dashboard, which summarizes what&apos;s
            happening right now.
          </p>
        </>
      ),
    },
    {
      key: "navigation",
      icon: PanelsTopLeft,
      title: "Getting around",
      body: (
        <>
          <p>
            The sidebar on the left lists every section you can reach. Any quick
            actions you&apos;re allowed to take
            {quickActions ? <> — {quickActions} — </> : " "}sit at the top of
            it.
          </p>
          <p>
            Use the toggle beside the logo to collapse the sidebar to icons.{" "}
            <strong>My Account</strong> at the bottom is where you set the
            preferred name that shows up wherever the portal names you.
          </p>
        </>
      ),
    },
    {
      key: "help",
      icon: CircleHelp,
      title: "Help is per page, not general",
      body: (
        <>
          <p>
            The <strong>?</strong> button in the header opens help for the page
            you&apos;re on right now, and its contents change as you move around
            the portal.
          </p>
          <p>
            So when a page has rules that aren&apos;t obvious — how an approval
            threshold works, what a status actually means — open it there rather
            than looking for a manual.
          </p>
        </>
      ),
    },
    {
      key: "notifications",
      icon: Bell,
      title: "The bell is your to-do list",
      body: (
        <>
          <p>
            <strong>Needs your attention</strong> gathers the work that is
            waiting on you specifically
            {attention ? <>: {attention}</> : null}. Each line takes you
            straight to it.
          </p>
          <p>
            The bell only appears when something is actually pending — if you
            can&apos;t see it in the header, nothing is waiting on you.
          </p>
        </>
      ),
    },
  ];
}
