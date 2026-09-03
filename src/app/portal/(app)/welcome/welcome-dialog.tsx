"use client";

import { completeWelcomeAction } from "./actions";
import { StepDialog } from "./step-dialog";
import { WELCOME_STEPS } from "./welcome-steps";

/**
 * The first-login tour. Rendered by the portal layout rather than by
 * /portal/home, because the sidebar, help button and bell it describes all
 * live in the layout -- and because a new user's first URL is often a deep
 * link from an invite rather than the dashboard.
 */
export function WelcomeDialog({ initialOpen }: { initialOpen: boolean }) {
  return (
    <StepDialog
      initialOpen={initialOpen}
      steps={WELCOME_STEPS}
      finishLabel="Get started"
      srLabel="the portal introduction"
      onDismiss={completeWelcomeAction}
    />
  );
}
