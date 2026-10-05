"use client";

import { useCallback, useState, useTransition } from "react";
import { runAction } from "@/components/portal/action-toast";
import {
  checkInRegistrantAction,
  restoreRegistrationAction,
  undoCheckInAction,
  type EventRegistrant,
} from "./registrants-actions";

/**
 * Check-in, undo and restore for one row at a time, shared by the event's
 * registrants card and the registrants page (#1511).
 *
 * `pendingId` names the row whose action is in flight, so only that row's
 * button disables.
 */
export function useRegistrantRowActions(onChanged: () => void) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const toggleCheckIn = useCallback(
    (registrant: EventRegistrant) => {
      setPendingId(registrant.id);
      startTransition(async () => {
        const undo = registrant.checked_in_at !== null;
        await runAction(
          () =>
            undo
              ? undoCheckInAction(registrant.id)
              : checkInRegistrantAction(registrant.id),
          {
            success: undo
              ? `Undid ${registrant.name}'s check-in.`
              : `${registrant.name} checked in.`,
            // Only a success refreshes. This is the door: an expired session or
            // an account without `events: manage` both leave the row exactly as
            // it was, and repainting it unchanged is what made a refusal look
            // like a completed check-in (#1124).
            onSuccess: onChanged,
          },
        );
        setPendingId(null);
      });
    },
    [onChanged],
  );

  const restore = useCallback(
    (registrant: EventRegistrant) => {
      setPendingId(registrant.id);
      startTransition(async () => {
        await runAction(() => restoreRegistrationAction(registrant.id), {
          success: `Restored ${registrant.name}'s registration.`,
          onSuccess: onChanged,
        });
        setPendingId(null);
      });
    },
    [onChanged],
  );

  const isRowPending = useCallback(
    (registrant: EventRegistrant) => isPending && pendingId === registrant.id,
    [isPending, pendingId],
  );

  return { toggleCheckIn, restore, isRowPending };
}
