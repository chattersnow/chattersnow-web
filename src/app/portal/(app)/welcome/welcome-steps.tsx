import { Bell, CircleHelp, PanelsTopLeft, Sparkles } from "lucide-react";
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
 * This is the standing introduction, not an announcement: anything tied to a
 * specific release goes in releases.ts instead.
 */
export const WELCOME_STEPS: DialogStep[] = [
  {
    key: "welcome",
    icon: Sparkles,
    title: "Welcome to the Operations Portal",
    body: (
      <>
        <p>
          This is where Chatter Snow&apos;s work gets tracked — events,
          donations, inventory, finances, governance, volunteers, and the
          content calendar.
        </p>
        <p>
          You&apos;ll only see the sections your role gives you access to, so
          the portal looks different from one person to the next. Your starting
          point is the Dashboard, which summarizes what&apos;s happening right
          now.
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
          actions you&apos;re allowed to take — creating an event, recording a
          donation — sit at the top of it.
        </p>
        <p>
          Use the toggle beside the Chatter Snow logo to collapse the sidebar to
          icons. <strong>My account</strong> at the bottom is where you set the
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
          <strong>Needs your attention</strong> gathers the work that is waiting
          on you specifically: approvals you can grant, attendees still to check
          in, new volunteer applications and contact messages, and content
          that&apos;s yours or overdue. Each line takes you straight to it.
        </p>
        <p>
          The bell only appears when something is actually pending — if you
          can&apos;t see it in the header, nothing is waiting on you.
        </p>
      </>
    ),
  },
];
