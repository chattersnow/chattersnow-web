"use client";

import { markReleaseSeenAction } from "./actions";
import { StepDialog } from "./step-dialog";
import { CURRENT_RELEASE, RELEASE_NOTES } from "./releases";

/**
 * Release notes for a returning user, shown once per release. The layout only
 * renders this when the notes are non-empty and the user's last_release_seen
 * is behind CURRENT_RELEASE.
 *
 * The release key travels with the dismissal rather than being read from a
 * constant server-side, so a tab left open across a deploy can only ever mark
 * the release it actually showed.
 */
export function WhatsNewDialog({ initialOpen }: { initialOpen: boolean }) {
  return (
    <StepDialog
      initialOpen={initialOpen}
      steps={RELEASE_NOTES}
      finishLabel="Got it"
      srLabel="what's new"
      onDismiss={() => markReleaseSeenAction(CURRENT_RELEASE)}
    />
  );
}
