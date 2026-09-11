"use client";

import type { PermissionMap } from "@/lib/auth/permissions";
import { completeWelcomeAction } from "./actions";
import { StepDialog } from "./step-dialog";
import { welcomeSteps } from "./welcome-steps";

/**
 * The first-login tour. Rendered by the portal layout rather than by
 * /portal/home, because the sidebar, help button and bell it describes all
 * live in the layout -- and because a new user's first URL is often a deep
 * link from an invite rather than the dashboard.
 *
 * Takes the layout's permission map so the copy can name only sections this
 * reader will find (#903). That map is already computed there for the nav, and
 * it is plain data, so handing it across the client boundary costs a prop
 * rather than a round trip.
 */
export function WelcomeDialog({
  initialOpen,
  permissions,
}: {
  initialOpen: boolean;
  permissions: PermissionMap;
}) {
  return (
    <StepDialog
      initialOpen={initialOpen}
      steps={welcomeSteps(permissions)}
      finishLabel="Get started"
      srLabel="the portal introduction"
      onDismiss={completeWelcomeAction}
    />
  );
}
